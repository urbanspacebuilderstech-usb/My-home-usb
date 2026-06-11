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
  Unlock,
  Undo2,
  Snowflake,
  Mail,
  MapPin,
  ChevronDown,
  Copy,
  ExternalLink,
  Paperclip,
  Loader2
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
import { RABDetailDialog } from '../components/RABDetailDialog';
import WORABTab from '../components/WORABTab';

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
// addDaysISO: returns YYYY-MM-DD that is `days` inclusive-days from `startISO`.
// Example: addDaysISO('2026-05-06', 7) → '2026-05-12' (6+7-1 = 12).
const addDaysISO = (startISO, days) => {
  if (!startISO || !days || days < 1) return '';
  const d = new Date(startISO);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + (Number(days) - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
    // Itemised: Name | Qty | Unit | Unit Rate | Total (auto) | Remarks
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }));
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

// Inline picker: 3 type pills → reason dropdown → optional "Others" text input
// → quick-pick delay days (1/2/Custom) so Planning can record how many days
// this hindrance pushed the schedule by. Custom opens a number input.
// Calls `onChange({hindrance_type, hindrance_reason, hindrances, hindrance_delay_days})`.
function HindrancePicker({ value, onChange, compact = false }) {
  const hType = value?.hindrance_type || '';
  const hReason = value?.hindrance_reason || '';
  const hNotes = value?.hindrances || '';
  const hDelay = value?.hindrance_delay_days ?? '';
  const isOthers = hReason === 'Others';
  const delayPresets = [1, 2];

  const clear = () => onChange({ hindrance_type: '', hindrance_reason: '', hindrances: '', hindrance_delay_days: '' });
  const setDelay = (d) => onChange({ hindrance_type: hType, hindrance_reason: hReason, hindrances: hNotes, hindrance_delay_days: d });

  return (
    <div className={`flex flex-col gap-1 ${compact ? '' : 'min-w-[180px]'}`}>
      <div className="flex gap-1">
        {Object.keys(HINDRANCE_REASONS).map(t => (
          <button
            type="button"
            key={t}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${hType === t ? HINDRANCE_TYPE_COLOR[t] + ' font-semibold' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
            onClick={() => onChange({ hindrance_type: t, hindrance_reason: '', hindrances: '', hindrance_delay_days: hDelay })}
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
          onChange={e => onChange({ hindrance_type: hType, hindrance_reason: e.target.value, hindrances: hNotes, hindrance_delay_days: hDelay })}
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
          onChange={e => onChange({ hindrance_type: hType, hindrance_reason: 'Others', hindrances: e.target.value, hindrance_delay_days: hDelay })}
          data-testid="hindrance-other-text"
        />
      )}
      {hType && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-gray-500 mr-1">Delay:</span>
          {delayPresets.map(d => (
            <button
              type="button"
              key={d}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${parseInt(hDelay) === d ? 'bg-amber-100 text-amber-700 border-amber-300 font-semibold' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              onClick={() => setDelay(d)}
              data-testid={`hindrance-delay-${d}`}
            >
              {d} day{d > 1 ? 's' : ''}
            </button>
          ))}
          <input
            type="number"
            min="1"
            placeholder="Custom"
            className="w-16 border rounded px-1.5 py-0.5 text-[10px]"
            value={(hDelay !== '' && !delayPresets.includes(parseInt(hDelay))) ? hDelay : ''}
            onChange={e => setDelay(e.target.value)}
            data-testid="hindrance-delay-custom"
          />
        </div>
      )}
    </div>
  );
}
// Read-only badge view used in the saved table
function HindranceBadge({ stage }) {
  const t = stage?.hindrance_type;
  const r = stage?.hindrance_reason;
  const notes = stage?.hindrances || stage?.remarks;
  const delay = stage?.hindrance_delay_days;
  if (!t && !r && !notes) return <span className="text-gray-300">-</span>;
  const tone = HINDRANCE_TYPE_COLOR[t] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0">
      {(t || r) && (
        <span
          className={`inline-flex items-center max-w-full text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border whitespace-nowrap leading-tight ${tone}`}
          title={`${t ? HINDRANCE_TYPE_LABEL[t] : ''}${t && r ? ' · ' : ''}${r || ''}${notes && r === 'Others' ? ` — ${notes}` : ''}${delay ? ` · +${delay}d` : ''}`}
        >
          <span className="truncate">{t ? HINDRANCE_TYPE_LABEL[t] : ''}{t && r ? ' · ' : ''}{r || ''}{delay ? ` · +${delay}d` : ''}</span>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-stretch">
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
              {/* Total Balance = Income − Expense (net cash held) */}
              <div className={`rounded-md p-2.5 border ${(totalIncome - totalExpense) >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`} data-testid="fin-perf-total-balance">
                <p className="text-[10px] text-gray-500 uppercase">Total Balance</p>
                <p className={`text-base font-extrabold mt-0.5 ${(totalIncome - totalExpense) >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>{fmtINR(totalIncome - totalExpense)}</p>
                <p className="text-[9px] text-gray-500 mt-0.5">Income − Expense</p>
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
      {paymentSummary && (() => {
        const feClientApproved = projectData?.project?.fe?.status === 'approved';
        const displayedProjectValue = feClientApproved ? (paymentSummary.project_value || 0) : 0;
        return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <CardContent className="p-3">
              <p className="text-xs text-indigo-600 font-medium">Project Value</p>
              <p className="text-lg font-bold text-indigo-700">{formatCurrency(displayedProjectValue)}</p>
              {!feClientApproved && (
                <p className="text-[10px] text-amber-700">Pending client approval</p>
              )}
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
        );
      })()}

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
  // Per-user tab permissions from Settings → Project Management Module.
  // null = still loading (treat as all-on to avoid flash). Object map = active.
  const [tabPermissions, setTabPermissions] = useState(null);
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
  // Inline-add row state (one per table). When non-null, a single editable row
  // is rendered at the bottom of the corresponding table.
  const [inlineNewScope, setInlineNewScope] = useState(null);
  const [inlineNewAddition, setInlineNewAddition] = useState(null);
  const [inlineNewDeduction, setInlineNewDeduction] = useState(null);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(false);
  // Choose Payment Schedule Template dialog
  const [chooseTemplateDialog, setChooseTemplateDialog] = useState(false);
  const [psTemplates, setPsTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateApplyMode, setTemplateApplyMode] = useState('append');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [bulkAdditionDialog, setBulkAdditionDialog] = useState(false);
  // When opening the "Add Additions" dialog from within a Section we capture
  // the section_id here so every row gets that section_id on submit.
  // null = ungrouped (legacy behaviour).
  const [bulkAdditionSectionId, setBulkAdditionSectionId] = useState(null);
  // Section management (folders that group additional_costs rows)
  const [additionSections, setAdditionSections] = useState([]);
  const [newSectionDialog, setNewSectionDialog] = useState(false);
  const [deleteAllAdditionsDialog, setDeleteAllAdditionsDialog] = useState({ open: false, typed: '', submitting: false });
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSection, setEditingSection] = useState(null); // { section_id, title }
  // Deduction sections — mirror of additionSections for the Deductions tab.
  const [deductionSections, setDeductionSections] = useState([]);
  const [newDedSectionDialog, setNewDedSectionDialog] = useState(false);
  const [newDedSectionTitle, setNewDedSectionTitle] = useState('');
  const [editingDedSection, setEditingDedSection] = useState(null);
  // The section context for the inline "+ Add" deduction (null = ungrouped)
  const [inlineDeductionSectionId, setInlineDeductionSectionId] = useState(null);
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
  const [newStages, setNewStages] = useState([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '', hindrances: '', sl_no: '', section_title: '', is_section_header: false, actual_start_date: '', actual_finish_date: '', duration_days: '', actual_duration_days: '', progress: 0, depends_on: '', hindrance_type: '', hindrance_reason: '' }]);
  const [saveTemplateDialog, setSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editingStageId, setEditingStageId] = useState(null);
  const [editStageData, setEditStageData] = useState({});
  // Global Edit Mode — when ON, every row is editable at once (no per-row pencil).
  // Each cell auto-saves via autoSaveStageField on change, so no Save button needed.
  const [globalEditMode, setGlobalEditMode] = useState(false);
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
  // Inline-edit form for Additional Work rows (parity with Final Estimate inline edit)
  const [editAdditionForm, setEditAdditionForm] = useState({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
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
  // Super-Admin View Stage Detail dialog (full lifecycle: summary, advance, incomes, cheques, timeline)
  const [stageDetailDialog, setStageDetailDialog] = useState({ open: false, stage: null, data: null, loading: false, tab: 'summary' });
  // Payment Schedule month/year filter (filters by expected_payment_date)
  const [psMonthFilter, setPsMonthFilter] = useState(''); // '' = all, format 'YYYY-MM'
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Inline edit for project header
  const [headerEditing, setHeaderEditing] = useState(false);
  const [headerForm, setHeaderForm] = useState({ name: '', client_name: '', client_phone: '', client_email: '', location: '', package_id: '', current_stage: '', status: '' });
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
  // RAB chain View popup — opened from Work Order rows + RAB approval queues.
  const [rabView, setRabView] = useState({ open: false, projectId: null, workOrderId: null, requestId: null });
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
  // Reusable WO Notes templates (Planning can save common phrases like
  // "Material at contractor cost" and pick from a dropdown next time).
  const [woNoteTemplates, setWoNoteTemplates] = useState([]);
  // Full Work Order templates (Scope + Stages + Additional snapshots)
  const [woTemplates, setWoTemplates] = useState([]);
  const [saveWoTplDialog, setSaveWoTplDialog] = useState({ open: false, sourceWo: null, name: '', submitting: false });
  const [useWoTplDialog, setUseWoTplDialog] = useState(false);
  // When set, the existing WO create/edit dialog acts as a TEMPLATE editor:
  // contractor row is hidden, Save button writes back to /wo-templates/{id}.
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  // Mark Critical dialog
  const [critDialog, setCritDialog] = useState({ open: false, is_critical: false, notes: '', submitting: false });
  // Add-template dialog (replaces ugly window.prompt)
  const [addTplDialog, setAddTplDialog] = useState({ open: false, text: '', submitting: false });
  // Delete-template confirmation dialog (replaces window.confirm)
  const [delTplDialog, setDelTplDialog] = useState({ open: false, template: null, submitting: false });
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
  // Sub-tab inside WO → Stages: In Process (default) | Locked | All
  const [stagesBucket, setStagesBucket] = useState('in_process');
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

      // Fetch this user's per-tab permissions in parallel (best effort).
      axios.get(`${API}/admin/project-module/me`)
        .then(r => setTabPermissions(r.data || {}))
        .catch(() => setTabPermissions({})); // fall back to "all visible" on error

      // QC users only see Project Stages — lock the activeTab.
      if (userRes.data.role === 'quality_check') {
        setActiveTab('project-stages');
      }
      
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
      // Pluck addition_sections from the full-details payload (added in
      // /app/backend/routes/financial.py) so the UI can group additional_costs.
      setAdditionSections(projectRes.data?.addition_sections || []);
      setDeductionSections(projectRes.data?.deduction_sections || []);
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
    { key: 'qc', label: 'QC', dbRole: 'quality_check', color: 'rose' },
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
      await axios.put(`${API}/projects/${projectId}/package-materials`, { materials: mats.map(m => ({ name: m.name || '', brand: m.brand || '', unit: m.unit || '', price: parseFloat(m.price) || 0 })) });
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
        // Templates may carry unit/price metadata — pull them into the
        // editable rows so the Planning Person doesn't have to retype every
        // unit/rate from scratch.
        const items = pkg.material_items.map(m => ({
          name: m.name,
          brand: m.brand || '',
          unit: m.unit || '',
          price: (m.price ?? m.estimated_rate ?? m.unit_price ?? m.rate ?? 0) || 0,
        }));
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
    // Fetch contractor types and contractors (merged: legacy + new), plus the
    // shared Notes template library so the dropdown is ready on first open.
    try {
      const [typesRes, contMerged, tplsRes] = await Promise.all([
        axios.get(`${API}/contractor-types`),
        fetchAllContractors(),
        axios.get(`${API}/wo-note-templates`).catch(() => ({ data: [] })),
      ]);
      setContractorTypes(typesRes.data || []);
      setAllContractors(contMerged);
      setWoNoteTemplates(Array.isArray(tplsRes.data) ? tplsRes.data : []);
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
    // Fetch full WO templates lazily so the "Use Template" option is ready
    axios.get(`${API}/wo-templates`).then(r => setWoTemplates(r.data || [])).catch(() => {});
  };

  // ── Full Work Order Templates ────────────────────────────────────────────
  // Save the current WO (or any existing WO) as a global reusable blueprint.
  const openSaveWoTemplate = (wo) => {
    setSaveWoTplDialog({ open: true, sourceWo: wo, name: wo?.contractor_type ? `${wo.contractor_type} — Standard` : '', submitting: false });
  };

  const handleSaveWoTemplate = async () => {
    const { sourceWo, name } = saveWoTplDialog;
    if (!sourceWo) return;
    const tplName = (name || '').trim();
    if (!tplName) { toast.error('Template name required'); return; }
    setSaveWoTplDialog(s => ({ ...s, submitting: true }));
    try {
      // Strip per-project fields. Stages are already a flat list on the WO; we
      // intentionally drop `source: "additional"` stages because they get
      // auto-regenerated at WO create time from additional_work entries.
      const payload = {
        name: tplName,
        contractor_type: sourceWo.contractor_type || '',
        description: sourceWo.notes || '',
        scope_items: (sourceWo.scope_items || []).map(s => ({ name: s.name, unit: s.unit, quantity: s.quantity, unit_rate: s.unit_rate })),
        stages: (sourceWo.stages || []).filter(s => s.source !== 'additional').map(s => ({ name: s.name, type: s.type, value: s.value })),
        additional_work: (sourceWo.additional_work || []).map(a => ({ description: a.description, unit: a.unit, quantity: a.quantity, unit_rate: a.unit_rate })),
        deductions: (sourceWo.deductions || []).map(d => ({ description: d.description, unit: d.unit, quantity: d.quantity, unit_rate: d.unit_rate })),
        labour_rates: sourceWo.labour_rates || null,
        notes: sourceWo.notes || '',
      };
      await axios.post(`${API}/wo-templates`, payload);
      toast.success(`Template "${tplName}" saved`);
      setSaveWoTplDialog({ open: false, sourceWo: null, name: '', submitting: false });
      const r = await axios.get(`${API}/wo-templates`).catch(() => ({ data: [] }));
      setWoTemplates(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save template');
      setSaveWoTplDialog(s => ({ ...s, submitting: false }));
    }
  };

  // Apply template into the open Create-WO form. Contractor pick stays with
  // the user; everything else is overwritten so the math (Stages tab, totals)
  // recalculates correctly.
  const applyWoTemplate = (tpl) => {
    if (!tpl) return;
    setWoForm(f => ({
      ...f,
      scope_items: (tpl.scope_items || []).map(s => ({ ...s })),
      stages: (tpl.stages || []).map(s => ({ ...s })),
      additional_work: (tpl.additional_work || []).map(a => ({ ...a })),
      deductions: (tpl.deductions || []).map(d => ({ ...d })),
      labour_rates: tpl.labour_rates || f.labour_rates,
      notes: tpl.notes || f.notes,
    }));
    setUseWoTplDialog(false);
    toast.success(`Loaded template: ${tpl.name}`);
  };

  const handleDeleteWoTemplate = async (tpl) => {
    if (!window.confirm(`Delete template "${tpl.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/wo-templates/${tpl.template_id}`);
      toast.success('Template deleted');
      const r = await axios.get(`${API}/wo-templates`).catch(() => ({ data: [] }));
      setWoTemplates(r.data || []);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  // Duplicate an existing template. Reuses the create endpoint with the
  // same payload + "(Copy)" suffix on the name; refreshes the list.
  const handleDuplicateWoTemplate = async (tpl) => {
    const copyName = `${tpl.name} (Copy)`;
    try {
      const payload = {
        name: copyName,
        contractor_type: tpl.contractor_type || '',
        description: tpl.description || '',
        scope_items: (tpl.scope_items || []).map(s => ({ name: s.name, unit: s.unit, quantity: s.quantity, unit_rate: s.unit_rate })),
        stages: (tpl.stages || []).filter(s => s.source !== 'additional').map(s => ({ name: s.name, type: s.type, value: s.value })),
        additional_work: (tpl.additional_work || []).map(a => ({ description: a.description, unit: a.unit, quantity: a.quantity, unit_rate: a.unit_rate })),
        deductions: (tpl.deductions || []).map(d => ({ description: d.description, unit: d.unit, quantity: d.quantity, unit_rate: d.unit_rate })),
        labour_rates: tpl.labour_rates || null,
        notes: tpl.notes || '',
      };
      await axios.post(`${API}/wo-templates`, payload);
      toast.success(`Duplicated as "${copyName}"`);
      const r = await axios.get(`${API}/wo-templates`).catch(() => ({ data: [] }));
      setWoTemplates(r.data || []);
    } catch (e) { toast.error(e.response?.data?.detail || 'Duplicate failed'); }
  };

  // Open the Create-WO dialog as a blank template editor (no contractor, no
  // existing rows). Save lands via handleSaveTemplateEdit / POST /wo-templates.
  const openNewWoTemplate = async () => {
    try {
      const typesRes = await axios.get(`${API}/contractor-types`).catch(() => ({ data: [] }));
      setContractorTypes(typesRes.data || []);
    } catch { /* non-fatal */ }
    const blank = {
      template_id: null, // sentinel — handleSaveTemplateEdit will treat as create
      name: '',
      contractor_type: '',
      description: '',
      scope_items: [],
      stages: [],
      additional_work: [],
      deductions: [],
      labour_rates: { skilled: 0, semi_skilled: 0, unskilled: 0 },
      notes: '',
    };
    setEditingTemplate(blank);
    setEditingTemplateName('');
    setEditingWo(null);
    setWoSelectedType('');
    setWoForm({
      contractor_id: '',
      notes: '',
      scope_items: [],
      stages: [],
      additional_work: [],
      deductions: [],
      labour_rates: { skilled: 0, semi_skilled: 0, unskilled: 0 },
    });
    setWoSubTab('scope');
    setWoMainTab('work_order');
    setUseWoTplDialog(false);
    setWoDialog(true);
  };

  // Edit an existing template — hijacks the WO create dialog as a template
  // editor. Contractor section is hidden because templates are contractor-
  // agnostic. handleSaveWo() detects `editingTemplate` and PATCHes instead
  // of creating a new Work Order.
  const openEditWoTemplate = async (tpl) => {
    // Pull fresh contractor types so existing dropdowns still render fine
    try {
      const typesRes = await axios.get(`${API}/contractor-types`).catch(() => ({ data: [] }));
      setContractorTypes(typesRes.data || []);
    } catch { /* non-fatal */ }
    setEditingTemplate(tpl);
    setEditingTemplateName(tpl.name || '');
    setEditingWo(null);
    setWoSelectedType(tpl.contractor_type || '');
    setWoForm({
      contractor_id: '',
      notes: tpl.notes || '',
      scope_items: (tpl.scope_items || []).map(s => ({ ...s })),
      stages: (tpl.stages || []).map(s => ({ ...s })),
      additional_work: (tpl.additional_work || []).map(a => ({ ...a })),
      deductions: (tpl.deductions || []).map(d => ({ ...d })),
      labour_rates: tpl.labour_rates || { skilled: 0, semi_skilled: 0, unskilled: 0 },
    });
    setWoSubTab('scope');
    setWoMainTab('work_order');
    setUseWoTplDialog(false);
    setWoDialog(true);
  };

  const handleSaveTemplateEdit = async () => {
    if (!editingTemplate) return;
    const name = (editingTemplateName || '').trim();
    if (!name) { toast.error('Template name required'); return; }
    try {
      const payload = {
        name,
        contractor_type: woSelectedType || editingTemplate.contractor_type || '',
        description: woForm.notes || '',
        scope_items: woForm.scope_items.map(s => ({ name: s.name, unit: s.unit, quantity: s.quantity, unit_rate: s.unit_rate })),
        stages: woForm.stages.filter(s => s.source !== 'additional').map(s => ({ name: s.name, type: s.type, value: s.value })),
        additional_work: woForm.additional_work.map(a => ({ description: a.description, unit: a.unit, quantity: a.quantity, unit_rate: a.unit_rate })),
        deductions: woForm.deductions.map(d => ({ description: d.description, unit: d.unit, quantity: d.quantity, unit_rate: d.unit_rate })),
        labour_rates: woForm.labour_rates || null,
        notes: woForm.notes || '',
      };
      if (editingTemplate.template_id) {
        await axios.patch(`${API}/wo-templates/${editingTemplate.template_id}`, payload);
        toast.success(`Template "${name}" saved`);
      } else {
        // New template path — POST and let backend assign template_id
        await axios.post(`${API}/wo-templates`, payload);
        toast.success(`Template "${name}" created`);
      }
      setEditingTemplate(null);
      setEditingTemplateName('');
      setWoDialog(false);
      const r = await axios.get(`${API}/wo-templates`).catch(() => ({ data: [] }));
      setWoTemplates(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save template');
    }
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
    // Open the RAB dialog rather than firing the request directly (amount is mandatory)
    setRabDialog({ open: true, workOrderId: woId, stageId, amount: '', notes: '', submitting: false });
  };

  // Site Engineer RAB Request dialog state — used by both legacy + new labour WO tables
  const [rabDialog, setRabDialog] = useState({ open: false, workOrderId: null, stageId: null, amount: '', notes: '', submitting: false });
  const handleWoStageRequest = (woId, stageId) => {
    setRabDialog({ open: true, workOrderId: woId, stageId, amount: '', notes: '', submitting: false });
  };
  const submitRabDialog = async () => {
    const { workOrderId, stageId, amount, notes } = rabDialog;
    const amt = parseFloat(amount || 0);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setRabDialog((d) => ({ ...d, submitting: true }));
    try {
      const res = await axios.patch(`${API}/projects/${projectId}/work-orders/${workOrderId}/stages/${stageId}/request-payment`, {
        amount: amt,
        notes: notes || '',
      });
      toast.success(`${res.data?.rab_number || 'RAB'} submitted — awaiting PM review`);
      setRabDialog({ open: false, workOrderId: null, stageId: null, amount: '', notes: '', submitting: false });
      fetchWorkOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit RAB');
      setRabDialog((d) => ({ ...d, submitting: false }));
    }
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

  const handleLockStage = async (woId, stageId) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${woId}/stages/${stageId}/lock`);
      toast.success('Stage locked');
      fetchWorkOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to lock stage'); }
  };

  // Returns Open / Locked / Completed only — RAB approval sub-states
  // (Awaiting PM/Planning/Accountant, Paid for one RAB, etc.) are NOT
  // stage statuses and must not be shown here. They live on the RAB row.
  const getStageStatusConfig = (status, isOpen, stage) => {
    if (stage && stage._fullyPaid) {
      return { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    if (isOpen) {
      return { label: 'Open', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    return { label: 'Locked', className: 'bg-gray-100 text-gray-700 border-gray-300' };
  };

  // Bucket a stage into one of: open / locked / completed
  //   completed → released across all RABs >= stage amount
  //   open      → is_open=true (regardless of in-flight RABs)
  //   locked    → otherwise
  const stageBucketOf = (st) => {
    const released = (st.payment_requests || []).filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
    const amount = Number(st.amount) || 0;
    if (amount > 0 && released >= amount) return 'completed';
    if (st.is_open === true) return 'open';
    return 'locked';
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



  // Inline Phase edit allowed for Planning Head, Super Admin, GM only.
  const canEditStageStatus = ['planning', 'super_admin', 'general_manager'].includes(user?.role);

  const startHeaderEdit = () => {
    if (!projectData?.project) return;
    const p = projectData.project;
    setHeaderForm({
      name: p.name || '',
      client_name: p.client_name || '',
      client_phone: p.client_phone || '',
      client_email: p.client_email || '',
      location: p.location || '',
      package_id: p.package_id || '',
      current_stage: p.current_stage || 'yet_to_start',
      status: p.status || 'in_planning',
      // Normalise to YYYY-MM-DD for the <input type="date"> control.
      start_date: p.start_date ? String(p.start_date).slice(0, 10) : '',
      expected_completion: p.expected_completion ? String(p.expected_completion).slice(0, 10) : '',
    });
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
      // Start Date / Expected Completion — emit ISO string when the form
      // value differs from the project (compared on YYYY-MM-DD).
      const pStart = p.start_date ? String(p.start_date).slice(0, 10) : '';
      const pEnd = p.expected_completion ? String(p.expected_completion).slice(0, 10) : '';
      if (headerForm.start_date !== pStart) {
        payload.start_date = headerForm.start_date || null;
      }
      if (headerForm.expected_completion !== pEnd) {
        payload.expected_completion = headerForm.expected_completion || null;
      }

      // Stage goes via its dedicated endpoint so the audit log / stage_history
      // are populated correctly (the generic PATCH /projects/{id} doesn't
      // track this transition). Status field is no longer surfaced in the
      // header form — Phase is now the single source of truth.
      const stageChanged = canEditStageStatus && headerForm.current_stage && headerForm.current_stage !== (p.current_stage || 'yet_to_start');

      if (Object.keys(payload).length === 0 && !stageChanged) {
        setHeaderEditing(false); setHeaderSaving(false); return;
      }

      if (Object.keys(payload).length > 0) {
        await axios.patch(`${API}/projects/${projectId}`, payload);
      }
      if (stageChanged) {
        await axios.patch(`${API}/planning/projects/${projectId}/update-stage?stage=${headerForm.current_stage}`);
      }

      // Optimistic update — fold all changes into local state
      setProjectData(prev => ({
        ...prev,
        project: {
          ...prev.project,
          ...payload,
          package_id: headerForm.package_id || null,
          ...(stageChanged ? { current_stage: headerForm.current_stage } : {}),
        },
      }));
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

  // ==================== INLINE-ADD HANDLERS ====================
  const saveInlineScope = async () => {
    const r = inlineNewScope;
    if (!r?.item_name?.trim()) { toast.error('Item name required'); return; }
    try {
      await axios.post(`${API}/scope-items`, {
        project_id: projectId,
        item_name: r.item_name.trim(),
        quantity: parseFloat(r.quantity) || 1,
        unit: r.unit || 'Nos',
        unit_rate: parseFloat(r.unit_rate) || 0,
        remarks: r.remarks || null,
      });
      toast.success('Scope item added');
      setInlineNewScope(null);
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add scope item');
    }
  };
  const saveInlineAddition = async () => {
    const r = inlineNewAddition;
    if (!r?.description?.trim()) { toast.error('Description required'); return; }
    const qty = parseFloat(r.qty) || 1;
    const price = parseFloat(r.price) || 0;
    try {
      await axios.post(`${API}/additional-costs`, {
        project_id: projectId,
        description: r.description.trim(),
        name: r.description.trim(),
        qty,
        unit: r.unit || 'Nos',
        price,
        estimated_amount: qty * price,
        remarks: r.remarks || null,
        section_id: r.section_id || null,
      });
      toast.success('Additional cost added');
      setInlineNewAddition(null);
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add additional cost');
    }
  };
  const saveInlineDeduction = async () => {
    const r = inlineNewDeduction;
    if (!r?.description?.trim()) { toast.error('Description required'); return; }
    const qty = parseFloat(r.qty) || 1;
    const price = parseFloat(r.price) || 0;
    try {
      await axios.post(`${API}/deductions`, {
        project_id: projectId,
        description: r.description.trim(),
        name: r.description.trim(),
        qty,
        unit: r.unit || 'Nos',
        price,
        amount: qty * price,
        remarks: r.remarks || null,
        section_id: inlineDeductionSectionId || null,
      });
      toast.success('Deduction added');
      setInlineNewDeduction(null);
      setInlineDeductionSectionId(null);
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add deduction');
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
    const validItems = bulkAdditionRows.filter(r => r.item_name && parseFloat(r.unit_rate) > 0 && parseFloat(r.quantity) > 0);
    if (validItems.length === 0) {
      toast.error('Please fill at least one row (Name + Qty + Unit Rate)');
      return;
    }
    
    try {
      await axios.post(`${API}/additional-costs/bulk`, {
        project_id: projectId,
        items: validItems.map(r => {
          const qty = parseFloat(r.quantity) || 1;
          const rate = parseFloat(r.unit_rate) || 0;
          const unit = (r.unit || 'Nos').trim() || 'Nos';
          const total = qty * rate;
          const desc = qty > 1 ? `${r.item_name} (${qty} ${unit} × ₹${rate.toFixed(2)})` : r.item_name;
          return {
            description: desc,
            estimated_amount: total,
            name: r.item_name,
            qty: qty,
            unit: unit,
            price: rate,
            remarks: r.remarks || null,
            section_id: bulkAdditionSectionId || undefined,
          };
        })
      });
      toast.success(`Added ${validItems.length} additions`);
      setBulkAdditionDialog(false);
      setBulkAdditionSectionId(null);
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
    setNewStages(prev => {
      const next = prev.map((s, i) => {
        if (i !== idx) return s;
        // Apply the field directly, then re-derive any dependent fields below.
        const merged = { ...s, [field]: value };
        // ── Duration ↔ Planned Finish auto-derive ──
        // Manual flow: user types Duration → recompute Planned Finish from Planned Start.
        // Implicit: user changes Planned Start → keep current Duration, recompute Finish.
        if (field === 'duration_days' && merged.start_date) {
          const dur = parseInt(value) || 0;
          merged.target_date = dur > 0 ? addDaysISO(merged.start_date, dur) : merged.target_date;
        } else if (field === 'start_date' && value) {
          const dur = parseInt(merged.duration_days) || 0;
          if (dur > 0) merged.target_date = addDaysISO(value, dur);
        }
        // ── Actual side: same flow. Duration recomputes Actual Finish from Actual Start. ──
        if (field === 'actual_duration_days' && merged.actual_start_date) {
          const dur = parseInt(value) || 0;
          merged.actual_finish_date = dur > 0 ? addDaysISO(merged.actual_start_date, dur) : merged.actual_finish_date;
        } else if (field === 'actual_start_date' && value) {
          const dur = parseInt(merged.actual_duration_days) || 0;
          if (dur > 0) merged.actual_finish_date = addDaysISO(value, dur);
        }
        return merged;
      });
      // ── Carry-forward: when this row's Actual Finish (or Planned Finish, if
      // no Actual Finish set yet) advances, push the FOLLOWING non-section
      // row's Planned Start = finish + 1 day — but only if that next row's
      // Planned Start is currently empty (don't overwrite manual entries).
      if ((field === 'actual_finish_date' || field === 'target_date' || field === 'duration_days') && next[idx].target_date) {
        // Find next non-section row after idx
        const nextRowIdx = next.findIndex((s, i) => i > idx && !s.is_section_header);
        if (nextRowIdx !== -1 && !next[nextRowIdx].start_date) {
          // Prefer Actual Finish, fall back to Planned Finish
          const anchor = field === 'actual_finish_date' ? value : (next[idx].actual_finish_date || next[idx].target_date);
          const d = new Date(anchor);
          if (!isNaN(d)) {
            d.setDate(d.getDate() + 1);
            next[nextRowIdx] = { ...next[nextRowIdx], start_date: d.toISOString().split('T')[0] };
            // If the next row has duration set, recompute its target_date too.
            const nextDur = parseInt(next[nextRowIdx].duration_days) || 0;
            if (nextDur > 0) {
              next[nextRowIdx].target_date = addDaysISO(next[nextRowIdx].start_date, nextDur);
            }
          }
        }
      }
      return next;
    });
  };

  const handleSaveStages = async () => {
    const valid = newStages
      .filter(s => s.stage_name.trim())
      // Use user-entered Duration when present, else derive from Planned dates.
      .map(s => ({
        ...s,
        duration_days: parseInt(s.duration_days) || daysBetween(s.start_date, s.target_date) || null,
      }));
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
      const NUMERIC_FIELDS = ['duration_days', 'progress', 'actual_duration_days', 'hindrance_delay_days'];
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
  // Coerces empty-string numeric fields to null so backend Pydantic validation
  // doesn't reject patches like { hindrance_delay_days: "" }.
  const autoSaveStageField = async (stageId, patch) => {
    const NUMERIC = new Set(['duration_days', 'actual_duration_days', 'progress', 'hindrance_delay_days']);
    const cleaned = {};
    for (const [k, v] of Object.entries(patch || {})) {
      if (NUMERIC.has(k)) {
        if (v === '' || v === null || v === undefined) cleaned[k] = null;
        else { const n = Number(v); cleaned[k] = Number.isFinite(n) ? n : null; }
      } else {
        cleaned[k] = v === '' ? null : v;
      }
    }
    try {
      await axios.patch(`${API}/projects/${projectId}/project-stages/${stageId}`, cleaned);
      fetchData(false);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(d => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join(' · ')
        : (typeof detail === 'string' ? detail : 'Auto-save failed');
      toast.error(msg);
    }
  };

  // Cascade-forward (PLANNED side): when this stage's Planned Finish moves,
  // push the next non-section stage's Planned Start = finish + 1 day (only if
  // next row's Planned Start is empty). Also recomputes that row's Planned
  // Finish if a Duration is already saved.
  const cascadeForwardFromStage = async (currentStageId, newPlannedFinishISO) => {
    if (!newPlannedFinishISO) return;
    const idx = projectStages.findIndex(s => s.stage_id === currentStageId);
    if (idx === -1) return;
    const next = projectStages.find((s, i) => i > idx && !s.is_section_header);
    if (!next || next.start_date) return;
    const d = new Date(newPlannedFinishISO);
    if (isNaN(d)) return;
    d.setDate(d.getDate() + 1);
    const nextStart = d.toISOString().split('T')[0];
    const nextDur = parseInt(next.duration_days) || 0;
    const patch = { start_date: nextStart };
    if (nextDur > 0) patch.target_date = addDaysISO(nextStart, nextDur);
    try {
      await axios.patch(`${API}/projects/${projectId}/project-stages/${next.stage_id}`, patch);
      fetchData(false);
    } catch { /* non-fatal — user can edit manually */ }
  };

  // Cascade-forward (ACTUAL side): when Actual Finish or Hindrance Delay moves,
  // push the next non-section stage's Actual Start = finish + delay days.
  // ── No hindrance → +1 day (next working day).
  // ── Hindrance N days → +N days from finish (e.g. finish 12-5 + 3 day hindrance
  //    means crew resumes on 15-5, so 12 + 3 = 15).
  // Honours manual entries: skips if next row's Actual Start is already filled.
  // Pass `forceOverwrite=true` to ignore that guard (used by hindrance edits so
  // the schedule snaps to the new delay immediately).
  const cascadeForwardActualFromStage = async (currentStageId, finishISO, delayDays, forceOverwrite = false) => {
    if (!finishISO) return;
    const idx = projectStages.findIndex(s => s.stage_id === currentStageId);
    if (idx === -1) return;
    const next = projectStages.find((s, i) => i > idx && !s.is_section_header);
    if (!next) return;
    if (!forceOverwrite && next.actual_start_date) return;
    const d = new Date(finishISO);
    if (isNaN(d)) return;
    const delay = Math.max(1, parseInt(delayDays) || 1);
    d.setDate(d.getDate() + delay);
    const nextStart = d.toISOString().split('T')[0];
    const nextDur = parseInt(next.actual_duration_days) || 0;
    const patch = { actual_start_date: nextStart };
    if (nextDur > 0) patch.actual_finish_date = addDaysISO(nextStart, nextDur);
    try {
      await axios.patch(`${API}/projects/${projectId}/project-stages/${next.stage_id}`, patch);
      fetchData(false);
    } catch { /* non-fatal */ }
  };

  // Helpers used by both per-row edit AND global Edit All mode.
  // When globalEditMode is ON, we bind cells to stage data directly and patch
  // each change to the backend immediately (no intermediate editStageData).
  const isStageEditable = (stage) => globalEditMode || editingStageId === stage.stage_id;
  const stageEditVal = (stage, field) => globalEditMode ? (stage[field] ?? '') : (editStageData[field] ?? '');
  const patchStageInline = (stage, patch) => {
    if (!globalEditMode) {
      setEditStageData(d => ({ ...d, ...patch }));
    }
    autoSaveStageField(stage.stage_id, patch);
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

  // Super-Admin: open the full lifecycle detail dialog for a payment stage.
  const openStageDetailDialog = async (stage) => {
    setStageDetailDialog({ open: true, stage, data: null, loading: true, tab: 'summary' });
    try {
      const r = await axios.get(`${API}/payment-stages/${stage.stage_id}/detail`);
      setStageDetailDialog((d) => ({ ...d, data: r.data, loading: false }));
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to load stage details');
      setStageDetailDialog({ open: false, stage: null, data: null, loading: false, tab: 'summary' });
    }
  };

  const handleDeleteAddition = async (costId) => {
    if (!confirm('Delete this addition?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Addition deleted');
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete addition');
    }
  };

  // Recall / Undo: pull a pending or rejected addition back so Planning can
  // edit or delete it. Blocked server-side once the client has approved.
  const handleRecallAddition = async (cost) => {
    const label = cost.name || cost.description || 'this addition';
    if (!window.confirm(`Recall "${label}" from the client? It will return to Draft so you can edit or delete it.`)) return;
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/recall-from-client`);
      toast.success('Recalled from client');
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to recall');
    }
  };

  // ── Addition Section handlers ────────────────────────────────────────────
  // Sections are folder-like groupings for additional_costs rows. They live
  // in db.addition_sections and carry a title + optional file attachments.
  const handleCreateSection = async () => {
    const title = (newSectionTitle || '').trim();
    if (!title) { toast.error('Section title is required'); return; }
    try {
      await axios.post(`${API}/projects/${projectId}/addition-sections`, { title });
      toast.success(`Section "${title}" created`);
      setNewSectionDialog(false);
      setNewSectionTitle('');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create section'); }
  };

  const handleRenameSection = async () => {
    if (!editingSection) return;
    const title = (editingSection.title || '').trim();
    if (!title) { toast.error('Title required'); return; }
    try {
      await axios.patch(`${API}/projects/${projectId}/addition-sections/${editingSection.section_id}`, { title });
      toast.success('Section renamed');
      setEditingSection(null);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to rename'); }
  };

  const handleDeleteSection = async (section) => {
    if (!window.confirm(`Delete section "${section.title}"?\nAdditions in this section will move back to "Ungrouped" (no data loss).`)) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/addition-sections/${section.section_id}`);
      toast.success('Section deleted');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete section'); }
  };

  const handleUploadSectionAttachment = async (section, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API}/projects/${projectId}/addition-sections/${section.section_id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('File attached');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
  };

  const handleDeleteSectionAttachment = async (section, fileId) => {
    if (!window.confirm('Remove this attachment?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/addition-sections/${section.section_id}/attachments/${fileId}`);
      toast.success('Attachment removed');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  // ── Deduction Section handlers (mirror Addition section flow) ────────────
  const handleUploadDedSectionAttachment = async (section, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API}/projects/${projectId}/deduction-sections/${section.section_id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('File attached');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
  };
  const handleDeleteDedSectionAttachment = async (section, fileId) => {
    if (!window.confirm('Remove this attachment?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/deduction-sections/${section.section_id}/attachments/${fileId}`);
      toast.success('Attachment removed');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };
  const handleCreateDedSection = async () => {
    const title = (newDedSectionTitle || '').trim();
    if (!title) { toast.error('Section title is required'); return; }
    try {
      await axios.post(`${API}/projects/${projectId}/deduction-sections`, { title });
      toast.success(`Section "${title}" created`);
      setNewDedSectionDialog(false);
      setNewDedSectionTitle('');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create section'); }
  };
  const handleRenameDedSection = async () => {
    if (!editingDedSection) return;
    const title = (editingDedSection.title || '').trim();
    if (!title) { toast.error('Title required'); return; }
    try {
      await axios.patch(`${API}/projects/${projectId}/deduction-sections/${editingDedSection.section_id}`, { title });
      toast.success('Section renamed');
      setEditingDedSection(null);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to rename'); }
  };
  const handleDeleteDedSection = async (section) => {
    if (!window.confirm(`Delete section "${section.title}"?\nDeductions in this section will move back to "Ungrouped" (no data loss).`)) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/deduction-sections/${section.section_id}`);
      toast.success('Section deleted');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete section'); }
  };
  // Open the inline-add row scoped to a specific section (or null for ungrouped).
  const openAddDeductionFor = (sectionId) => {
    setInlineDeductionSectionId(sectionId || null);
    setInlineNewDeduction({ description: '', qty: 1, unit: 'Nos', price: 0, remarks: '' });
  };
  // Section-level batch chain handlers (mirror additional cost section batch)
  const submitDedSectionForReview = async (section, items) => {
    const eligible = items.filter(d => !d.approval_status || ['created','rejected'].includes(d.approval_status));
    if (eligible.length === 0) { toast.info('Nothing to submit — all rows are already in the approval chain.'); return; }
    if (!window.confirm(`Submit ${eligible.length} deduction${eligible.length === 1 ? '' : 's'} in "${section.title || 'Ungrouped'}" to Planning Head?`)) return;
    try {
      if (section.section_id) {
        await axios.post(`${API}/projects/${projectId}/deduction-sections/${section.section_id}/submit-for-review`);
      } else {
        for (const d of eligible) {
          try { await axios.post(`${API}/deductions/${d.deduction_id}/submit-for-review`); } catch { /* skip */ }
        }
      }
      toast.success(`Submitted ${eligible.length} item(s) for review`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit'); }
  };
  const phApproveDedSection = async (section, items) => {
    const eligible = items.filter(d => d.approval_status === 'ph_review');
    if (eligible.length === 0) { toast.info('No items awaiting Planning Head approval here.'); return; }
    if (!window.confirm(`PH Approve ${eligible.length} item(s) and forward to GM?`)) return;
    try {
      if (section.section_id) {
        await axios.post(`${API}/projects/${projectId}/deduction-sections/${section.section_id}/ph-approve`);
      } else {
        for (const d of eligible) {
          try { await axios.post(`${API}/deductions/${d.deduction_id}/ph-approve`); } catch { /* skip */ }
        }
      }
      toast.success(`Forwarded ${eligible.length} item(s) to GM`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  const gmApproveDedSection = async (section, items) => {
    const eligible = items.filter(d => d.approval_status === 'gm_review');
    if (eligible.length === 0) { toast.info('No items awaiting GM approval here.'); return; }
    if (!window.confirm(`GM Approve ${eligible.length} item(s)? They will become visible to the Client immediately.`)) return;
    try {
      if (section.section_id) {
        await axios.post(`${API}/projects/${projectId}/deduction-sections/${section.section_id}/gm-approve`);
      } else {
        for (const d of eligible) {
          try { await axios.post(`${API}/deductions/${d.deduction_id}/gm-approve`); } catch { /* skip */ }
        }
      }
      toast.success(`GM approved ${eligible.length} item(s) — visible to Client`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };



  // ── Project-level (ungrouped) attachment handlers ─────────────────────
  // Files attached to the ungrouped block live on project.additional_attachments
  // so old/legacy Additional Work rows can carry references without a section.
  const handleUploadUngroupedAttachment = async (file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API}/projects/${projectId}/additional-attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('File attached');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
  };

  const handleDeleteUngroupedAttachment = async (fileId) => {
    if (!window.confirm('Remove this attachment?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/additional-attachments/${fileId}`);
      toast.success('Attachment removed');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  // Batch: Send all eligible ungrouped additions to the client at once.
  const sendUngroupedToClient = async (items) => {
    const eligible = items.filter(c => !['pending_client', 'client_approved'].includes(c.client_approval_status));
    if (eligible.length === 0) { toast.info('Nothing to send — all ungrouped rows are already sent or approved.'); return; }
    const total = eligible.reduce((s, x) => s + (x.estimated_amount || 0), 0);
    if (!window.confirm(`Send ${eligible.length} ungrouped addition${eligible.length === 1 ? '' : 's'} (₹${Number(total).toLocaleString('en-IN')}) to client for approval?`)) return;
    try {
      await axios.post(`${API}/projects/${projectId}/additional-costs/send-ungrouped-to-client`);
      toast.success(`Sent ${eligible.length} item(s) to client`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to send'); }
  };

  // ── Client Approval lifecycle for Additions ───────────────────────────
  // Per-row send. Optimistic UI: row goes amber "Pending Client" immediately.
  const sendAdditionToClient = async (cost) => {
    if (!window.confirm(`Send "${cost.description || cost.name}" (₹${Number(cost.estimated_amount || 0).toLocaleString('en-IN')}) to client for approval?`)) return;
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/send-to-client`);
      toast.success('Sent to client for approval');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to send'); }
  };

  // Section batch send — confirms with count + total amount.
  const sendSectionToClient = async (section, items) => {
    const total = items.reduce((s, x) => s + (x.estimated_amount || 0), 0);
    if (!window.confirm(`Send ${items.length} addition${items.length === 1 ? '' : 's'} (₹${Number(total).toLocaleString('en-IN')}) in "${section.title}" to client for approval?`)) return;
    try {
      await axios.post(`${API}/projects/${projectId}/addition-sections/${section.section_id}/send-to-client`);
      toast.success('Section sent to client');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to send'); }
  };

  // Helper used by the Additional tab — opens the Add Additions dialog with
  // an explicit section context (or null for ungrouped).
  const openAddAdditionFor = (sectionId) => {
    setBulkAdditionSectionId(sectionId || null);
    setBulkAdditionRows(createEmptyRows('addition'));
    setBulkAdditionDialog(true);
  };

  const handleRequestAdditionPayment = async (costId, expectedDate) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}/request-payment`, {
        expected_payment_date: expectedDate || null,
      });
      toast.success('Payment request sent to CRE Payment Schedule. CRE will collect and forward to Accountant.');
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

  // ── 4-Step Additional Cost Approval Chain (PP → PH → GM → Client) ─────
  // Backend lives in /app/backend/routes/projects.py around line 4815-4940.
  // We keep these handlers compact: server enforces role + status validity,
  // we only do a confirm prompt and refresh on success.
  const submitAdditionForReview = async (cost) => {
    if (!window.confirm(`Submit "${cost.description || cost.name || 'this item'}" to Planning Head for review?`)) return;
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/submit-for-review`);
      toast.success('Submitted to Planning Head');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit'); }
  };
  const phApproveAddition = async (cost) => {
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/ph-approve`);
      toast.success('Forwarded to GM');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  const phRejectAddition = async (cost) => {
    const reason = window.prompt('Reason for rejecting back to Planning Person:', '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/ph-reject`, { reason: reason.trim() });
      toast.success('Rejected back to Planning Person');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reject'); }
  };
  const gmApproveAddition = async (cost) => {
    if (!window.confirm(`GM Approve "${cost.description || cost.name || 'this item'}"? It will become visible to the Client immediately.`)) return;
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/gm-approve`);
      toast.success('GM approved — visible to Client');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  const gmRejectAddition = async (cost) => {
    const reason = window.prompt('Reason for rejecting back to Planning Person:', '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await axios.post(`${API}/additional-costs/${cost.cost_id}/gm-reject`, { reason: reason.trim() });
      toast.success('Rejected back to Planning Person');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reject'); }
  };
  // Section-level batch operations (run when user clicks button in the section toolbar)
  const submitSectionForReview = async (section, items) => {
    const eligible = items.filter(c => !c.approval_status || ['created', 'rejected'].includes(c.approval_status));
    if (eligible.length === 0) { toast.info('Nothing to submit — all rows are already in the approval chain.'); return; }
    if (!window.confirm(`Submit ${eligible.length} addition${eligible.length === 1 ? '' : 's'} in "${section.title || 'Ungrouped'}" to Planning Head?`)) return;
    try {
      if (section.section_id) {
        await axios.post(`${API}/projects/${projectId}/addition-sections/${section.section_id}/submit-for-review`);
      } else {
        // Ungrouped: hit per-row endpoint (no section batch for ungrouped on backend)
        for (const c of eligible) {
          try { await axios.post(`${API}/additional-costs/${c.cost_id}/submit-for-review`); } catch { /* skip */ }
        }
      }
      toast.success(`Submitted ${eligible.length} item(s) for review`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit'); }
  };
  const phApproveSection = async (section, items) => {
    const eligible = items.filter(c => c.approval_status === 'ph_review');
    if (eligible.length === 0) { toast.info('No items awaiting Planning Head approval here.'); return; }
    if (!window.confirm(`PH Approve ${eligible.length} item(s) and forward to GM?`)) return;
    try {
      if (section.section_id) {
        await axios.post(`${API}/projects/${projectId}/addition-sections/${section.section_id}/ph-approve`);
      } else {
        for (const c of eligible) {
          try { await axios.post(`${API}/additional-costs/${c.cost_id}/ph-approve`); } catch { /* skip */ }
        }
      }
      toast.success(`Forwarded ${eligible.length} item(s) to GM`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  const gmApproveSection = async (section, items) => {
    const eligible = items.filter(c => c.approval_status === 'gm_review');
    if (eligible.length === 0) { toast.info('No items awaiting GM approval here.'); return; }
    if (!window.confirm(`GM Approve ${eligible.length} item(s)? They will become visible to the Client immediately.`)) return;
    try {
      if (section.section_id) {
        await axios.post(`${API}/projects/${projectId}/addition-sections/${section.section_id}/gm-approve`);
      } else {
        for (const c of eligible) {
          try { await axios.post(`${API}/additional-costs/${c.cost_id}/gm-approve`); } catch { /* skip */ }
        }
      }
      toast.success(`GM approved ${eligible.length} item(s) — visible to Client`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };

  // Section-level rejection helpers (Feb 2026). Backend doesn't expose
  // section-batch reject endpoints, so we loop client-side over the eligible
  // rows. The same reason text is sent to each row, which is exactly what
  // Planning Head / GM want — they're rejecting the whole section in one
  // go for a single reason. Failures on individual rows are surfaced as a
  // count rather than aborting the loop.
  const phRejectSection = async (section, items) => {
    const eligible = items.filter(c => c.approval_status === 'ph_review');
    if (eligible.length === 0) { toast.info('No items awaiting Planning Head approval here.'); return; }
    const reason = window.prompt(`Reject ${eligible.length} item(s) in "${section.title || section.name || 'Ungrouped'}" back to Planning Person.\n\nReason:`, '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    let failed = 0;
    for (const c of eligible) {
      try { await axios.post(`${API}/additional-costs/${c.cost_id}/ph-reject`, { reason: reason.trim() }); }
      catch { failed += 1; }
    }
    if (failed) toast.error(`${failed}/${eligible.length} row(s) failed to reject`);
    else toast.success(`Rejected ${eligible.length} item(s) back to Planning Person`);
    fetchData(false);
  };
  const gmRejectSection = async (section, items) => {
    const eligible = items.filter(c => c.approval_status === 'gm_review');
    if (eligible.length === 0) { toast.info('No items awaiting GM approval here.'); return; }
    const reason = window.prompt(`Reject ${eligible.length} item(s) in "${section.title || section.name || 'Ungrouped'}" back to Planning Person.\n\nReason:`, '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    let failed = 0;
    for (const c of eligible) {
      try { await axios.post(`${API}/additional-costs/${c.cost_id}/gm-reject`, { reason: reason.trim() }); }
      catch { failed += 1; }
    }
    if (failed) toast.error(`${failed}/${eligible.length} row(s) failed to reject`);
    else toast.success(`Rejected ${eligible.length} item(s) back to Planning Person`);
    fetchData(false);
  };

  // ── 4-Step Deduction Approval Chain (PP → PH → GM → CRE-notify → Client) ──
  // Mirrors the Additional Cost chain. Endpoints live on the same projects.py router.
  const submitDeductionForReview = async (d) => {
    if (!window.confirm(`Submit "${d.description || 'this deduction'}" to Planning Head for review?`)) return;
    try {
      await axios.post(`${API}/deductions/${d.deduction_id}/submit-for-review`);
      toast.success('Submitted to Planning Head');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit'); }
  };
  const phApproveDeduction = async (d) => {
    try {
      await axios.post(`${API}/deductions/${d.deduction_id}/ph-approve`);
      toast.success('Forwarded to GM');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  const phRejectDeduction = async (d) => {
    const reason = window.prompt('Reason for rejecting back to Planning Person:', '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await axios.post(`${API}/deductions/${d.deduction_id}/ph-reject`, { reason: reason.trim() });
      toast.success('Rejected back to Planning Person');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reject'); }
  };
  const gmApproveDeduction = async (d) => {
    if (!window.confirm(`GM Approve "${d.description || 'this deduction'}"? CRE will be notified and Client will be asked to approve.`)) return;
    try {
      await axios.post(`${API}/deductions/${d.deduction_id}/gm-approve`);
      toast.success('GM approved — sent to Client (CRE notified)');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  const gmRejectDeduction = async (d) => {
    const reason = window.prompt('Reason for rejecting back to Planning Person:', '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await axios.post(`${API}/deductions/${d.deduction_id}/gm-reject`, { reason: reason.trim() });
      toast.success('Rejected back to Planning Person');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reject'); }
  };

  // Render the inner table cells for a single deduction row (used inside
  // per-section grouped tables below). Status column carries the full 4-step
  // chain pipeline UI; Section column is intentionally omitted because each
  // group renders its own table inside its section card.
  const renderDeductionRowCells = (d, index) => {
    const qty = d.qty || 1;
    const unit = d.unit || '';
    const unitRate = d.price != null ? d.price : (d.amount || 0) / qty;
    return (
      <>
        <td className="px-4 py-3 text-sm">{index + 1}</td>
        <td className="px-4 py-3 font-medium">{d.description}</td>
        <td className="px-3 py-3 text-right text-sm">{qty}</td>
        <td className="px-3 py-3 text-sm text-gray-700">{unit || '-'}</td>
        <td className="px-3 py-3 text-right text-sm">₹{Number(unitRate).toLocaleString('en-IN')}</td>
        <td className="px-3 py-3 text-right font-semibold text-orange-600">-₹{(d.amount || 0).toLocaleString('en-IN')}</td>
        <td className="px-3 py-3 text-sm text-gray-500">{d.remarks || '-'}</td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {(!d.approval_status || ['created', 'rejected'].includes(d.approval_status)) && (
              d.approval_status === 'rejected' ? (
                <>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium" title={d.rejection_reason || ''} data-testid={`ded-rejected-${d.deduction_id}`}>
                    Rejected{d.rejected_at_step ? ` at ${d.rejected_at_step === 'general_manager' ? 'GM' : d.rejected_at_step === 'planning_head' ? 'PH' : 'Client'}` : ''}{d.rejection_reason ? `: ${d.rejection_reason.length > 18 ? d.rejection_reason.slice(0, 18) + '…' : d.rejection_reason}` : ''}
                  </span>
                  {(user?.role === 'planning_person' || user?.role === 'planning' || user?.role === 'super_admin') && (
                    <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-500 text-amber-700 hover:bg-amber-50 text-xs" onClick={() => submitDeductionForReview(d)} data-testid={`ded-resubmit-${d.deduction_id}`}>
                      <Send className="h-3 w-3" /> Resubmit
                    </Button>
                  )}
                </>
              ) : (
                (user?.role === 'planning_person' || user?.role === 'planning' || user?.role === 'super_admin') && (
                  <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-500 text-amber-700 hover:bg-amber-50 text-xs" onClick={() => submitDeductionForReview(d)} data-testid={`ded-submit-review-${d.deduction_id}`}>
                    <Send className="h-3 w-3" /> Submit for Review
                  </Button>
                )
              )
            )}
            {d.approval_status === 'ph_review' && (
              <>
                <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium" data-testid={`ded-ph-review-${d.deduction_id}`}>Pending Planning Head</span>
                {(user?.role === 'planning' || user?.role === 'super_admin') && (
                  <>
                    <Button variant="outline" size="sm" className="h-7 gap-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-xs" onClick={() => phApproveDeduction(d)} data-testid={`ded-ph-approve-${d.deduction_id}`}>
                      <CheckCircle2 className="h-3 w-3" /> PH Approve
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 border-rose-500 text-rose-700 hover:bg-rose-50 text-xs" onClick={() => phRejectDeduction(d)} data-testid={`ded-ph-reject-${d.deduction_id}`}>
                      <X className="h-3 w-3" /> Reject
                    </Button>
                  </>
                )}
              </>
            )}
            {d.approval_status === 'gm_review' && (
              <>
                <span className="text-[11px] px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium" data-testid={`ded-gm-review-${d.deduction_id}`}>Pending GM</span>
                {(user?.role === 'general_manager' || user?.role === 'super_admin') && (
                  <>
                    <Button variant="outline" size="sm" className="h-7 gap-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-xs" onClick={() => gmApproveDeduction(d)} data-testid={`ded-gm-approve-${d.deduction_id}`}>
                      <CheckCircle2 className="h-3 w-3" /> GM Approve
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 border-rose-500 text-rose-700 hover:bg-rose-50 text-xs" onClick={() => gmRejectDeduction(d)} data-testid={`ded-gm-reject-${d.deduction_id}`}>
                      <X className="h-3 w-3" /> Reject
                    </Button>
                  </>
                )}
              </>
            )}
            {d.approval_status === 'awaiting_client' && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium" data-testid={`ded-pending-client-${d.deduction_id}`}>Pending Client</span>
            )}
            {d.approval_status === 'client_approved' && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium" data-testid={`ded-client-approved-${d.deduction_id}`}>Client Approved</span>
            )}
          </div>
        </td>
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
    );
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

  // ==================== ADDITIONAL WORK INLINE EDIT (parity with FE inline edit) ====================
  const openAdditionEdit = (cost) => {
    const qty = cost.qty || 1;
    const unitRate = cost.price != null ? cost.price : (qty > 0 ? cost.estimated_amount / qty : 0);
    setEditingAddition(cost.cost_id);
    setEditAdditionForm({
      item_name: cost.name || cost.description || '',
      quantity: qty,
      unit: cost.unit || 'Nos',
      unit_rate: unitRate,
      remarks: cost.remarks || '',
    });
  };

  const saveAdditionInline = async () => {
    if (!editingAddition) return;
    const name = (editAdditionForm.item_name || '').trim();
    const qty = parseFloat(editAdditionForm.quantity) || 1;
    const rate = parseFloat(editAdditionForm.unit_rate) || 0;
    const unit = (editAdditionForm.unit || 'Nos').trim() || 'Nos';
    const total = qty * rate;
    if (!name) { toast.error('Name is required'); return; }
    const desc = qty > 1 ? `${name} (${qty} ${unit} × ₹${rate.toFixed(2)})` : name;
    try {
      await axios.patch(`${API}/additional-costs/${editingAddition}`, {
        name,
        description: desc,
        qty,
        unit,
        price: rate,
        estimated_amount: total,
        remarks: editAdditionForm.remarks || null,
      });
      toast.success('Addition updated');
      setEditingAddition(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update addition');
    }
  };

  const cancelAdditionEdit = () => {
    setEditingAddition(null);
    setEditAdditionForm({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
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

  const canManageBase = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant' || user?.role === 'planning' || user?.role === 'planning_person' || user?.role === 'planning_head' || user?.role === 'general_manager';
  // FE / scope edit lock is enforced by the backend per item (returns 423 when
  // a Planning Person tries to edit a scope item that's in PH/GM/Client review).
  // The frontend used to also pre-lock the entire UI, but that hid Send-to-Client,
  // Delete All, edit icons, etc. for Additional Work + Deductions which have their
  // own approval chain. So we no longer pre-gate here — the backend has the say.
  const isPlanningPerson = user?.role === 'planning_person';  const LOCKED_FE_STATUSES = ['pending_planning_head_review', 'pending_gm_review', 'pending_cre_review', 'pending_client_review', 'feedback_received', 'approved'];
  const isFeLocked = LOCKED_FE_STATUSES.includes(projectData?.project?.fe?.status);
  const canManage = canManageBase;
  const canManageAdditionsDeductions = canManageBase;
  const isSuperAdmin = user?.role === 'super_admin';
  const isPM = user?.role === 'project_manager';
  const isQC = user?.role === 'quality_check';
  // QC sees only the Project Stages tab (no financials, value calc, or income/expense).
  const canSeeFinancials = !isPM && !isQC;
  // Super-admin-controlled per-tab access (Settings → Project Management Module).
  // null = still loading → treat as allow-all to avoid flash.
  // Super Admin always sees everything regardless of stored permissions.
  const tabAllowed = (key) => {
    if (isSuperAdmin) return true;
    if (tabPermissions === null) return true;
    return tabPermissions[key] !== false;
  };

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

  const { project, scope_items = [], additional_costs = [], deductions = [], summary, pre_construction = [] } = projectData || {};
  // Filter Additional-derived payment_stages out of Payment Schedule listing.
  // These come from Req Payment on additions and should only appear inside the
  // Additional tab — not pollute the milestone Payment Schedule view.
  const payment_stages = (projectData?.payment_stages || []).filter(s => !s.is_addition && !s.linked_addition_id);

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

    const rawFeTotal = (scope_items || []).reduce((s, it) => s + (it.total_amount || 0), 0);
    // FE total always displays the live scope total — independent of client approval.
    const isClientApproved = fe.status === 'approved';
    const feTotal = rawFeTotal;
    // Only CLIENT-APPROVED additions contribute to the grand total (matches backend
    // /value-summary rule). Pending / under-review / rejected rows count as ₹0.
    const addTotal = (additional_costs || [])
      .filter(a => a.client_approval_status === 'client_approved' || a.client_approved === true)
      .reduce((s, a) => s + (a.estimated_amount || 0), 0);
    const dedTotal = (deductions || [])
      .filter(d => d.client_approval_status === 'client_approved')
      .reduce((s, d) => s + (d.amount || 0), 0);
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
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-2">
                Total Final Estimate Cost
                {project?.fe?.fe_number && (
                  <Badge variant="outline" className="text-[10px] font-mono border-amber-400 text-amber-800 bg-white" data-testid="fe-number-badge">
                    {project.fe.fe_number}
                  </Badge>
                )}
              </div>
              {!isClientApproved && rawFeTotal > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] font-medium" data-testid="fe-pending-client-pill">
                  Pending Client Approval
                </Badge>
              )}
            </div>
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
                        fetchData(false);
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
                // Role-aware back: CRE → CRE Board, Planning → Planning Board,
                // GM → GM Dashboard (new sub-tab UI), everyone else → /projects.
                let dest = '/projects';
                if (isPlanning) dest = '/planning-board';
                else if (user?.role === 'cre') dest = '/cre-board?tab=all_projects';
                else if (user?.role === 'general_manager') dest = '/gm-dashboard';
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
                    {canEditStageStatus && (
                      <div>
                        <Label className="text-xs text-gray-500">Phase</Label>
                        <Select
                          value={(() => {
                            const id = headerForm.current_stage || 'yet_to_start';
                            if (id === 'yet_to_start') return 'pre_construction';
                            if (['foundation', 'plinth'].includes(id)) return 'substructure';
                            if (['ground_floor', 'first_floor', 'slab'].includes(id)) return 'superstructure';
                            if (['plastering', 'flooring', 'painting', 'handover', 'completed'].includes(id)) return 'finishing';
                            return 'pre_construction';
                          })()}
                          onValueChange={(v) => {
                            // Saving a Phase writes back the FIRST canonical stage in that
                            // phase so downstream reports (which read current_stage) keep
                            // working without a separate schema migration.
                            const map = { pre_construction: 'yet_to_start', substructure: 'foundation', superstructure: 'ground_floor', finishing: 'plastering' };
                            setHeaderForm(f => ({ ...f, current_stage: map[v] || 'yet_to_start' }));
                          }}
                        >
                          <SelectTrigger data-testid="header-edit-phase"><SelectValue placeholder="Select Phase" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pre_construction">Pre-Construction</SelectItem>
                            <SelectItem value="substructure">Substructure</SelectItem>
                            <SelectItem value="superstructure">Superstructure</SelectItem>
                            <SelectItem value="finishing">Finishing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {/* Start Date — surfaces on Client Portal Project Details. */}
                    <div>
                      <Label className="text-xs text-gray-500">Start Date</Label>
                      <Input
                        type="date"
                        value={headerForm.start_date || ''}
                        onChange={(e) => setHeaderForm(f => ({ ...f, start_date: e.target.value }))}
                        data-testid="header-edit-start-date"
                      />
                    </div>
                    {/* Expected Completion — surfaces on Client Portal Project Details. */}
                    <div>
                      <Label className="text-xs text-gray-500">Expected Completion</Label>
                      <Input
                        type="date"
                        value={headerForm.expected_completion || ''}
                        min={headerForm.start_date || undefined}
                        onChange={(e) => setHeaderForm(f => ({ ...f, expected_completion: e.target.value }))}
                        data-testid="header-edit-expected-completion"
                      />
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 data-testid="project-detail-title" className="text-xl sm:text-3xl font-bold text-gray-900 truncate">
                      {project.name}
                    </h2>
                    {project.project_number && (
                      <Badge variant="outline" className="text-[11px] font-mono border-violet-300 text-violet-700 bg-violet-50" data-testid="project-number-badge">
                        {project.project_number}
                      </Badge>
                    )}
                    {project.is_critical && (
                      <Badge className="bg-red-600 text-white hover:bg-red-700 gap-1" data-testid="critical-badge">
                        <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                        Critical
                      </Badge>
                    )}
                    {(user?.role === 'super_admin' || user?.role === 'cre' || user?.role === 'planning' || user?.role === 'general_manager') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-indigo-600 shrink-0" onClick={startHeaderEdit} data-testid="header-edit-btn">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Mark Critical action — Planning/PM/Super Admin can flag this project as critical with a note. */}
                    {['super_admin', 'planning', 'planning_person', 'project_manager', 'general_manager'].includes(user?.role) && (
                      <Button
                        size="sm"
                        variant={project.is_critical ? 'destructive' : 'outline'}
                        className={`h-7 text-xs gap-1 ${project.is_critical ? '' : 'text-red-600 border-red-200 hover:bg-red-50'}`}
                        data-testid="mark-critical-btn"
                        onClick={() => setCritDialog({
                          open: true,
                          is_critical: !!project.is_critical,
                          notes: project.critical_notes || '',
                          submitting: false,
                        })}
                      >
                        <span className={`block h-1.5 w-1.5 rounded-full ${project.is_critical ? 'bg-white' : 'bg-red-500'}`} />
                        {project.is_critical ? 'Critical' : 'Mark Critical'}
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
                      fetchData(false);
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
          // Project Value mirrors live Final Estimate scope_items. If FE is
          // deleted (scope_items removed), every value below resets to ₹0 —
          // do NOT fall back to the stale locked project value.
          const scopeTotal = summary.scope_total || 0;
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
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Project Value Calculation</p>
                    {summary?.scope_total_pending > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 font-medium" data-testid="pvc-pending-pill">
                        Pending Client Approval · ₹{(summary.scope_total_pending || 0).toLocaleString('en-IN')}
                      </Badge>
                    )}
                  </div>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-stretch">
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
                    {/* Total Balance = Income − Expense */}
                    <div className={`rounded-md p-2.5 border ${(totalIncome - totalExpense) >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`} data-testid="fin-perf-total-balance-main">
                      <p className="text-[10px] text-gray-500 uppercase">Total Balance</p>
                      <p className={`text-base font-extrabold mt-0.5 ${(totalIncome - totalExpense) >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>{fmtINR(totalIncome - totalExpense)}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">Income − Expense</p>
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
              {user?.role === 'quality_check' ? (
                <TabsList className="bg-transparent border-0 p-0 h-auto gap-0 w-full justify-between overflow-x-auto flex-nowrap" data-testid="qc-restricted-tabs">
                  <TabsTrigger value="project-stages" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-project-stages">
                    Stages - Project Stages
                  </TabsTrigger>
                </TabsList>
              ) : (
              <TabsList className="bg-transparent border-0 p-0 h-auto gap-0 w-full justify-between overflow-x-auto flex-nowrap">
                {/* Order: Estimate → Final Estimate → Payment Schedule → Work Order → Materials →
                    Payment Summary → Team → Construction Stage (CRE) → Project Stages → Documents */}
                {tabAllowed('rough-estimate') && <TabsTrigger value="rough-estimate" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Estimate
                </TabsTrigger>}
                {tabAllowed('scope') && <TabsTrigger value="scope" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Final Estimate
                </TabsTrigger>}
                {canSeeFinancials && tabAllowed('payments') && <TabsTrigger value="payments" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Payment Schedule
                </TabsTrigger>}
                {tabAllowed('labours') && <TabsTrigger value="labours" className="data-[state=active]:border-b-2 data-[state=active]:border-teal-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-labours">
                  Work Order (Labour)
                </TabsTrigger>}
                {tabAllowed('materials') && <TabsTrigger value="materials" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-materials">
                  Materials
                </TabsTrigger>}
                {canSeeFinancials && tabAllowed('payment-summary') && <TabsTrigger value="payment-summary" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none px-4 py-3 text-[15px] font-medium bg-green-50 whitespace-nowrap flex-1 text-center">
                  Payment Summary
                </TabsTrigger>}
                {tabAllowed('team') && <TabsTrigger value="team" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-team">
                  Team
                </TabsTrigger>}
                {tabAllowed('construction-stage') && <TabsTrigger value="construction-stage" className="data-[state=active]:border-b-2 data-[state=active]:border-rose-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-construction-stage">
                  Pre-Construction Stages
                </TabsTrigger>}
                {tabAllowed('project-stages') && <TabsTrigger value="project-stages" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-project-stages">
                  Stages - Project Stages
                </TabsTrigger>}
                {/* Cheques tab moved INSIDE Payment Summary as a sub-tab — kept as a hidden mount-point so /tab=cheques deep links still resolve */}
                {tabAllowed('documents') && <TabsTrigger value="documents" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Documents
                </TabsTrigger>}
              </TabsList>
              )}
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
                          project.fe.status === 'pending_planning_head_review' ? 'bg-cyan-100 text-cyan-700' :
                          project.fe.status === 'rejected_by_planning_head' ? 'bg-rose-100 text-rose-700' :
                          project.fe.status === 'rejected_by_gm' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {project.fe.status === 'pending_planning_head_review' ? 'Pending Planning Head Review' :
                           project.fe.status === 'rejected_by_planning_head' ? 'Rejected by Planning Head — Action needed' :
                           project.fe.status === 'pending_gm_review' ? 'Pending GM Approval' :
                           project.fe.status === 'rejected_by_gm' ? 'Rejected by GM — Action needed' :
                           project.fe.status === 'pending_cre_review' ? 'Sent to CRE' :
                           project.fe.status === 'review_pending' ? 'Review from CRE — Action needed' :
                           project.fe.status === 'approved' ? 'Approved by CRE' : project.fe.status}
                        </Badge>
                        {project?.fe?.sent_to_client_at && (
                          <span className="text-[10px] text-gray-400">Last client send: {new Date(project.fe.sent_to_client_at).toLocaleString()}</span>
                        )}
                        {/* Restart FE Approval — for Planning Person / Planning Head / Super Admin */}
                        {['planning_person', 'planning', 'super_admin'].includes(user?.role) && project.fe.status !== 'draft' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-7 px-2 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50 gap-1"
                            data-testid="fe-restart-approval-btn"
                            onClick={async () => {
                              const reason = window.prompt('Restart Final Estimate approval — this resets the FE to draft so it re-runs through Planning Person → Planning Head → GM.\n\nOptional note (audit trail):');
                              if (reason === null) return;
                              try {
                                await axios.post(`${API}/final-estimates/${projectId}/restart-approval`, { reason: reason || '' });
                                toast.success('Approval chain restarted. Re-submit through Planning Head → GM.');
                                fetchData(false);
                              } catch (err) {
                                toast.error(err.response?.data?.detail || 'Failed to restart approval');
                              }
                            }}
                          >
                            <RefreshCw className="h-3 w-3" /> Restart Approval
                          </Button>
                        )}
                      </div>
                      {project.fe.status === 'rejected_by_gm' && (project.fe.gm_rejections || []).length > 0 && (
                        <div className="mt-2 p-2 rounded bg-white border border-red-200" data-testid="fe-gm-rejection-reason">
                          <div className="text-[11px] font-semibold text-red-600 mb-0.5">GM Rejection Reason (Rev {project.fe.gm_rejections[project.fe.gm_rejections.length - 1].revision}):</div>
                          <div className="text-xs text-gray-700 whitespace-pre-wrap">{project.fe.gm_rejections[project.fe.gm_rejections.length - 1].reason}</div>
                          <div className="text-[10px] text-gray-400 mt-1">— {project.fe.gm_rejections[project.fe.gm_rejections.length - 1].by_name || 'GM'} · {new Date(project.fe.gm_rejections[project.fe.gm_rejections.length - 1].at).toLocaleString()}</div>
                        </div>
                      )}
                      {project.fe.status === 'rejected_by_planning_head' && (project.fe.planning_head_rejections || []).length > 0 && (
                        <div className="mt-2 p-2 rounded bg-white border border-rose-200" data-testid="fe-planning-head-rejection-reason">
                          <div className="text-[11px] font-semibold text-rose-600 mb-0.5">Planning Head Rejection Reason (Rev {project.fe.planning_head_rejections[project.fe.planning_head_rejections.length - 1].revision}):</div>
                          <div className="text-xs text-gray-700 whitespace-pre-wrap">{project.fe.planning_head_rejections[project.fe.planning_head_rejections.length - 1].reason}</div>
                          <div className="text-[10px] text-gray-400 mt-1">— Planning Head · {new Date(project.fe.planning_head_rejections[project.fe.planning_head_rejections.length - 1].at).toLocaleString()}</div>
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
                  {/* Planning Person — "Save Estimate" to forward to Planning Head */}
                  {(user?.role === 'planning_person' || user?.role === 'super_admin') &&
                    (!project?.fe?.status || ['draft', 'review_pending', 'rejected_by_gm', 'rejected_by_planning_head'].includes(project.fe.status)) && (
                    <Button
                      data-testid="fe-save-to-planning-head-btn"
                      size="sm"
                      className="gap-1 sm:gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs sm:text-sm"
                      onClick={async () => {
                        const isResave = ['review_pending', 'rejected_by_gm', 'rejected_by_planning_head'].includes(project.fe?.status);
                        const msg = isResave
                          ? `Re-save updated Final Estimate? This will be marked as Rev ${(project.fe?.revision || 0) + 1} and sent to Planning Head.`
                          : 'Save Final Estimate and lock it for Planning Head review?\n\nOnce saved, you will not be able to edit until Planning Head reviews.';
                        if (!window.confirm(msg)) return;
                        try {
                          await axios.post(`${API}/planning/projects/${projectId}/final-estimate/save`);
                          toast.success('Final Estimate saved — sent to Planning Head');
                          fetchData(false);
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Failed to save');
                        }
                      }}
                    >
                      <Send className="h-3 w-3 sm:h-4 sm:w-4" /> {['review_pending','rejected_by_gm','rejected_by_planning_head'].includes(project.fe?.status) ? 'Re-save Estimate' : 'Save Estimate'}
                    </Button>
                  )}

                  {/* Planning Head — Approve / Reject (only when status is pending_planning_head_review) */}
                  {(user?.role === 'planning' || user?.role === 'super_admin') && project?.fe?.status === 'pending_planning_head_review' && (
                    <>
                      <Button
                        data-testid="fe-planning-head-approve-btn"
                        size="sm"
                        className="gap-1 sm:gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm"
                        onClick={async () => {
                          if (!window.confirm('Approve this Final Estimate and forward to GM?')) return;
                          try {
                            await axios.post(`${API}/planning-head/projects/${projectId}/final-estimate/approve`);
                            toast.success('Approved — sent to GM');
                            fetchData(false);
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Failed to approve');
                          }
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" /> Approve → GM
                      </Button>
                      <Button
                        data-testid="fe-planning-head-reject-btn"
                        size="sm"
                        variant="outline"
                        className="gap-1 sm:gap-2 border-rose-300 text-rose-700 hover:bg-rose-50 text-xs sm:text-sm"
                        onClick={async () => {
                          const reason = window.prompt('Rejection reason (will be shown to Planning Person):');
                          if (!reason || !reason.trim()) return;
                          try {
                            await axios.post(`${API}/planning-head/projects/${projectId}/final-estimate/reject`, { reason: reason.trim() });
                            toast.success('Rejected — sent back to Planning Person');
                            fetchData(false);
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Failed to reject');
                          }
                        }}
                      >
                        <XCircle className="h-3 w-3 sm:h-4 sm:w-4" /> Reject
                      </Button>
                    </>
                  )}

                  {/* Planning Head / Super-Admin legacy direct submit-to-GM — only when no Planning Person workflow is active */}
                  {(user?.role === 'planning' || user?.role === 'super_admin') &&
                    (!project?.fe?.status || ['draft', 'review_pending', 'rejected_by_gm'].includes(project.fe.status)) && (
                    <Button
                      data-testid="fe-submit-to-gm-btn"
                      size="sm"
                      variant="outline"
                      className="gap-1 sm:gap-2 text-xs sm:text-sm"
                      onClick={async () => {
                        const isResend = ['review_pending', 'rejected_by_gm'].includes(project.fe?.status);
                        const msg = isResend
                          ? `Re-submit updated Final Estimate to GM? Marked as Rev ${(project.fe?.revision || 0) + 1}.`
                          : 'Submit this Final Estimate directly to GM (skip Planning Person flow)?';
                        if (!window.confirm(msg)) return;
                        try {
                          await axios.post(`${API}/planning/projects/${projectId}/final-estimate/submit-to-gm`);
                          toast.success('Final Estimate sent to GM');
                          fetchData(false);
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Failed to submit');
                        }
                      }}
                    >
                      <Send className="h-3 w-3 sm:h-4 sm:w-4" /> Submit to GM
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
                    <Button
                      data-testid="add-scope-btn"
                      size="sm"
                      className="gap-1 sm:gap-2 bg-secondary hover:bg-secondary/90 text-xs sm:text-sm"
                      onClick={() => setInlineNewScope({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' })}
                    >
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Scope
                    </Button>
                  )}
                  {/* Bulk-add dialog (kept available; trigger removed in favor of inline add) */}
                  {canManage && (
                    <Dialog open={bulkScopeDialog} onOpenChange={setBulkScopeDialog}>
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
                    {scope_items.length === 0 && !inlineNewScope ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 8} className="px-4 py-8 text-center text-gray-500">
                          No scope items defined yet. Click "Add Scope" to define project scope.
                        </td>
                      </tr>
                    ) : scope_items.length === 0 ? null : (
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
                    {/* Inline Add New Scope Row */}
                    {canManage && inlineNewScope && (
                      <tr className="bg-emerald-50/40 border-y border-emerald-200" data-testid="inline-add-scope-row">
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2 text-xs text-emerald-700 font-medium">New</td>
                        <td className="px-2 py-2">
                          <Input
                            autoFocus
                            placeholder="Item name…"
                            value={inlineNewScope.item_name}
                            onChange={(e) => setInlineNewScope(r => ({ ...r, item_name: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveInlineScope(); if (e.key === 'Escape') setInlineNewScope(null); }}
                            className="h-8 text-sm"
                            data-testid="inline-scope-item-name"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" min={0} step="0.01" value={inlineNewScope.quantity}
                            onChange={(e) => setInlineNewScope(r => ({ ...r, quantity: e.target.value }))}
                            className="h-8 text-sm w-24" data-testid="inline-scope-qty" />
                        </td>
                        <td className="px-2 py-2">
                          <UnitSelect value={inlineNewScope.unit}
                            onChange={(v) => setInlineNewScope(r => ({ ...r, unit: v }))}
                            className="h-8" data-testid="inline-scope-unit" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" min={0} step="0.01" value={inlineNewScope.unit_rate}
                            onChange={(e) => setInlineNewScope(r => ({ ...r, unit_rate: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveInlineScope(); }}
                            className="h-8 text-sm w-28" data-testid="inline-scope-rate" />
                        </td>
                        <td className="px-2 py-2 text-right text-sm font-medium text-amber-700">
                          ₹{((parseFloat(inlineNewScope.quantity) || 0) * (parseFloat(inlineNewScope.unit_rate) || 0)).toLocaleString()}
                        </td>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2">
                          <Input placeholder="Remarks (optional)" value={inlineNewScope.remarks}
                            onChange={(e) => setInlineNewScope(r => ({ ...r, remarks: e.target.value }))}
                            className="h-8 text-xs" data-testid="inline-scope-remarks" />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <Button size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 mr-1" onClick={saveInlineScope} data-testid="inline-scope-save">Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500" onClick={() => setInlineNewScope(null)} data-testid="inline-scope-cancel">Cancel</Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {scope_items.length > 0 && (
                    <tfoot className="bg-amber-50 border-t-2">
                      <tr>
                        <td colSpan={canManage ? 8 : 5} className="px-4 py-3 text-right font-bold">
                          Project Value (Scope Total):
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700" data-testid="scope-total-cell">
                          ₹{(scope_items || []).reduce((s, it) => s + (it.total_amount || 0), 0).toLocaleString()}
                        </td>
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
                    {!showAddStages && canManage && projectStages.length > 0 && (
                      <Button
                        size="sm"
                        variant={globalEditMode ? 'default' : 'outline'}
                        className={`gap-2 ${globalEditMode ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                        onClick={() => { setGlobalEditMode(!globalEditMode); setEditingStageId(null); }}
                        data-testid="global-edit-toggle"
                      >
                        {globalEditMode ? <><Check className="h-4 w-4" /> Done</> : <><Edit className="h-4 w-4" /> Edit All</>}
                      </Button>
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
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Duration<br/><span className="text-[10px] normal-case text-gray-400">(days)</span></th>
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
                                      data-testid={`new-stage-planned-start-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    {/* Planned Finish — auto-computed from Planned Start + Duration, read-only */}
                                    <span className="inline-block w-28 px-2 py-1 text-xs text-center bg-gray-50 rounded border border-gray-200 text-gray-700" data-testid={`new-stage-planned-finish-${idx}`}>
                                      {stage.target_date ? new Date(stage.target_date).toLocaleDateString('en-IN') : '—'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    {/* Duration (days) — MANUAL entry. updateNewStage recomputes Planned Finish from Planned Start. */}
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder="Days"
                                      className="w-16 border rounded px-2 py-1 text-xs text-center"
                                      value={stage.duration_days ?? ''}
                                      onChange={(e) => updateNewStage(idx, 'duration_days', e.target.value)}
                                      data-testid={`new-stage-duration-${idx}`}
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
                                    {/* Actual Finish — auto-computed from Actual Start + Duration, read-only */}
                                    <span className="inline-block w-28 px-2 py-1 text-xs text-center bg-gray-50 rounded border border-gray-200 text-gray-700" data-testid={`new-stage-actual-finish-${idx}`}>
                                      {stage.actual_finish_date ? new Date(stage.actual_finish_date).toLocaleDateString('en-IN') : '—'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    {/* Actual Duration (days) — MANUAL entry. Recomputes Actual Finish from Actual Start. */}
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder="Days"
                                      className="w-16 border rounded px-2 py-1 text-xs text-center"
                                      value={stage.actual_duration_days ?? ''}
                                      onChange={(e) => updateNewStage(idx, 'actual_duration_days', e.target.value)}
                                      data-testid={`new-stage-actual-duration-${idx}`}
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
                                      data-testid={`stage-depends-on-${idx}`}
                                    >
                                      <option value="">—</option>
                                      <option value="Internal">Internal</option>
                                      <option value="Client">Client</option>
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
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Duration (days)</th>
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
                              {isStageEditable(stage) ? (
                                <input className="border rounded px-2 py-1 text-sm w-full" value={stageEditVal(stage, 'stage_name')} onChange={e => patchStageInline(stage, { stage_name: e.target.value })} data-testid={`stage-name-${stage.stage_id}`} />
                              ) : (
                                <span className="font-medium">{stage.stage_name}</span>
                              )}
                            </td>
                            {/* Planned Start — entering this with existing Duration auto-computes Planned Finish */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={stageEditVal(stage, 'start_date') || ''} onChange={e => {
                                  const v = e.target.value;
                                  const dur = parseInt(stageEditVal(stage, 'duration_days')) || 0;
                                  const currFinish = stageEditVal(stage, 'target_date');
                                  const newFinish = (v && dur > 0) ? addDaysISO(v, dur) : currFinish;
                                  patchStageInline(stage, { start_date: v || null, target_date: newFinish || currFinish || null, duration_days: dur || daysBetween(v, newFinish || currFinish) || null });
                                  if (newFinish) cascadeForwardFromStage(stage.stage_id, newFinish);
                                }} data-testid={`stage-planned-start-${stage.stage_id}`} />
                              ) : (
                                <span className="text-sm">{stage.start_date ? new Date(stage.start_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Planned Finish — read-only auto-computed from Planned Start + Duration */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <span className="inline-block w-28 px-2 py-1 text-sm text-center bg-gray-50 rounded border border-gray-200 text-gray-700" title="Auto-computed from Planned Start + Duration" data-testid={`stage-planned-finish-${stage.stage_id}`}>
                                  {stageEditVal(stage, 'target_date') ? new Date(stageEditVal(stage, 'target_date')).toLocaleDateString('en-IN') : '—'}
                                </span>
                              ) : (
                                <span className="text-sm">{stage.target_date ? new Date(stage.target_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Duration (days) — MANUAL entry. Updating this recomputes Planned Finish from Planned Start. */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <input
                                  type="number"
                                  min="1"
                                  className="border rounded px-2 py-1 text-sm w-20 text-center"
                                  value={stageEditVal(stage, 'duration_days') ?? ''}
                                  onChange={e => {
                                    const dur = parseInt(e.target.value) || 0;
                                    const startVal = stageEditVal(stage, 'start_date');
                                    const currFinish = stageEditVal(stage, 'target_date');
                                    const newFinish = (startVal && dur > 0) ? addDaysISO(startVal, dur) : currFinish;
                                    patchStageInline(stage, { duration_days: dur || null, target_date: newFinish || null });
                                    if (newFinish) cascadeForwardFromStage(stage.stage_id, newFinish);
                                  }}
                                  data-testid={`stage-duration-${stage.stage_id}`}
                                  placeholder="Days"
                                />
                              ) : (
                                <span className="text-sm text-gray-600">
                                  {stage.duration_days || daysBetween(stage.start_date, stage.target_date) || '-'}
                                </span>
                              )}
                            </td>
                            {/* Actual Start */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={stageEditVal(stage, 'actual_start_date') || ''} onChange={e => {
                                  const v = e.target.value;
                                  const dur = parseInt(stageEditVal(stage, 'actual_duration_days')) || 0;
                                  const currFinish = stageEditVal(stage, 'actual_finish_date');
                                  const newFinish = (v && dur > 0) ? addDaysISO(v, dur) : currFinish;
                                  patchStageInline(stage, { actual_start_date: v || null, actual_finish_date: newFinish || null });
                                  if (newFinish) cascadeForwardActualFromStage(stage.stage_id, newFinish, stageEditVal(stage, 'hindrance_delay_days'));
                                }} />
                              ) : (
                                <span className="text-sm">{stage.actual_start_date ? new Date(stage.actual_start_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Actual Finish — read-only auto-computed from Actual Start + Duration when both set */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <span className="inline-block w-28 px-2 py-1 text-sm text-center bg-gray-50 rounded border border-gray-200 text-gray-700" title="Auto-computed from Actual Start + Duration" data-testid={`stage-actual-finish-${stage.stage_id}`}>
                                  {stageEditVal(stage, 'actual_finish_date') ? new Date(stageEditVal(stage, 'actual_finish_date')).toLocaleDateString('en-IN') : '—'}
                                </span>
                              ) : (
                                <span className="text-sm">{stage.actual_finish_date ? new Date(stage.actual_finish_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Duration (days) — Actual side. MANUAL entry, recomputes Actual Finish from Actual Start. */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <input
                                  type="number"
                                  min="1"
                                  className="border rounded px-2 py-1 text-sm w-20 text-center"
                                  value={stageEditVal(stage, 'actual_duration_days') ?? ''}
                                  onChange={e => {
                                    const dur = parseInt(e.target.value) || 0;
                                    const startVal = stageEditVal(stage, 'actual_start_date');
                                    const currFinish = stageEditVal(stage, 'actual_finish_date');
                                    const newFinish = (startVal && dur > 0) ? addDaysISO(startVal, dur) : currFinish;
                                    patchStageInline(stage, { actual_duration_days: dur || null, actual_finish_date: newFinish || null });
                                    if (newFinish) cascadeForwardActualFromStage(stage.stage_id, newFinish, stageEditVal(stage, 'hindrance_delay_days'));
                                  }}
                                  data-testid={`stage-actual-duration-${stage.stage_id}`}
                                  placeholder="Days"
                                />
                              ) : (
                                <span className="text-sm text-gray-600">
                                  {stage.actual_duration_days || daysBetween(stage.actual_start_date, stage.actual_finish_date) || '-'}
                                </span>
                              )}
                            </td>
                            {/* Progress (% complete) — also doubles as Status indicator */}
                            <td className="px-3 py-3 text-center">
                              {isStageEditable(stage) ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="5"
                                    className="border rounded px-2 py-1 text-sm w-16 text-center"
                                    value={stageEditVal(stage, 'progress') ?? ''}
                                    onChange={e => {
                                      const pct = e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value)));
                                      const auto_status = pct === '' ? stageEditVal(stage, 'status') : pct >= 100 ? 'finished' : pct > 0 ? 'started' : 'yet_to_start';
                                      patchStageInline(stage, { progress: pct === '' ? null : pct, status: auto_status });
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
                            {/* Depends On — Internal vs Client (no more free text) */}
                            <td className="px-3 py-3 text-center text-xs">
                              {isStageEditable(stage) ? (
                                <select
                                  className="border rounded px-2 py-1 text-xs w-24 text-center"
                                  value={stageEditVal(stage, 'depends_on') || ''}
                                  onChange={e => patchStageInline(stage, { depends_on: e.target.value || null })}
                                  data-testid={`stage-depends-on-edit-${stage.stage_id}`}
                                >
                                  <option value="">—</option>
                                  <option value="Internal">Internal</option>
                                  <option value="Client">Client</option>
                                </select>
                              ) : (
                                (() => {
                                  if (!stage.depends_on) return <span className="text-gray-300">-</span>;
                                  // Migrate any legacy free-text values: anything that isn't exactly
                                  // "Internal" or "Client" still renders, but as a muted label.
                                  const v = String(stage.depends_on).trim();
                                  const isCanonical = v === 'Internal' || v === 'Client';
                                  const cls = isCanonical
                                    ? (v === 'Internal' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                                    : 'bg-gray-50 text-gray-500 border-gray-200';
                                  return <span className={`inline-flex items-center gap-1 text-[11px] rounded border px-1.5 py-0.5 ${cls}`}>{v}</span>;
                                })()
                              )}
                            </td>
                            {/* Hindrances */}
                            <td className="px-3 py-3 text-sm text-gray-600 max-w-[220px]">
                              {isStageEditable(stage) ? (
                                <HindrancePicker
                                  value={{
                                    hindrance_type: stageEditVal(stage, 'hindrance_type'),
                                    hindrance_reason: stageEditVal(stage, 'hindrance_reason'),
                                    hindrances: stageEditVal(stage, 'hindrances') || stageEditVal(stage, 'remarks'),
                                    hindrance_delay_days: stageEditVal(stage, 'hindrance_delay_days'),
                                  }}
                                  onChange={(patch) => {
                                    patchStageInline(stage, { ...patch, remarks: patch.hindrances ?? null });
                                    // If hindrance_delay_days changed AND this stage has an Actual Finish,
                                    // force-cascade the next row's Actual Start so the schedule snaps.
                                    if ('hindrance_delay_days' in patch) {
                                      const finish = stageEditVal(stage, 'actual_finish_date');
                                      if (finish) cascadeForwardActualFromStage(stage.stage_id, finish, patch.hindrance_delay_days, true);
                                    }
                                  }}
                                  compact
                                />
                              ) : (
                                <HindranceBadge stage={stage} />
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                {!globalEditMode && editingStageId === stage.stage_id ? (
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-green-600" onClick={() => handleUpdateStage(stage.stage_id)}><Check className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingStageId(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex justify-center gap-1">
                                    {!globalEditMode && (
                                      <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingStageId(stage.stage_id); setEditStageData({ stage_name: stage.stage_name, start_date: stage.start_date || '', target_date: stage.target_date || '', duration_days: stage.duration_days ?? '', actual_start_date: stage.actual_start_date || '', actual_finish_date: stage.actual_finish_date || '', actual_duration_days: stage.actual_duration_days ?? daysBetween(stage.actual_start_date, stage.actual_finish_date) ?? '', progress: stage.progress ?? (stage.status === 'finished' ? 100 : stage.status === 'started' ? 50 : 0), status: stage.status, hindrances: stage.hindrances || stage.remarks || '', remarks: stage.hindrances || stage.remarks || '', depends_on: stage.depends_on || '', hindrance_type: stage.hindrance_type || '', hindrance_reason: stage.hindrance_reason || '', hindrance_delay_days: stage.hindrance_delay_days ?? '' }); }}>
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                    )}
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
                // Project Value = LOCKED Grand Total (scope + additions − deductions),
                // returned by /payment-summary as `summary.project_value`. Falls
                // back to the project's stored `total_value` so the UI never shows
                // blank during initial load. NEVER use sum-of-stage-amounts — that
                // only equals project value when stages sum to 100%, which is the
                // bug the user reported.
                const rawTotalValue = Number(summary?.project_value) || Number(projectData?.project?.total_value) || 0;
                // Project Value is gated by FE client-approval per business rule.
                // Until client signs off, surface ₹0 with a "Pending Client Approval" hint.
                const feClientApproved = projectData?.project?.fe?.status === 'approved';
                const totalValue = feClientApproved ? rawTotalValue : 0;
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
                      {!feClientApproved && (
                        <p className="text-[10px] text-amber-700 mt-0.5">Pending client approval</p>
                      )}
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
                    {user?.role !== 'project_manager' && ` (₹${(summary?.project_value || projectData?.project?.total_value || 0).toLocaleString()})`}
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
                      const totalValueForRow = summary?.project_value || projectData?.project?.total_value || summary?.scope_total || 0;
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
                        // A stage with amount==0 must NEVER be flagged "Collected"
                        // — those are placeholder/0% rows that have not been
                        // assigned a real value yet. Treat them as Pending so
                        // CRE/Planning realise the amount still needs to be set.
                        const isPaid = (stage.amount || 0) > 0 && balance <= 0;
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
                                {/* Super-Admin only — view full lifecycle detail */}
                                {isSuperAdmin && (
                                  <Button
                                    data-testid={`view-payment-stage-${stage.stage_id}`}
                                    variant="ghost"
                                    size="icon"
                                    title="View stage details (Super Admin)"
                                    onClick={() => openStageDetailDialog(stage)}
                                  >
                                    <Eye className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
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
                    <Button
                      variant="outline"
                      className="gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!additional_costs?.length}
                      onClick={() => setDeleteAllAdditionsDialog({ open: true, typed: '', submitting: false })}
                      data-testid="delete-all-additions-btn"
                      title={additional_costs?.length ? 'Delete every Additional Work row in this project' : 'No additions to delete'}
                    >
                      <Trash2 className="h-4 w-4" />Delete All
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="outline"
                      className="gap-2 border-dashed"
                      onClick={() => { setNewSectionTitle(''); setNewSectionDialog(true); }}
                      data-testid="create-section-btn"
                    >
                      <Plus className="h-4 w-4" />Create Section
                    </Button>
                  )}
                  {canManageAdditionsDeductions && (
                    <Button
                      data-testid="add-addition-btn"
                      className="gap-2 bg-secondary hover:bg-secondary/90 hidden"
                      onClick={() => setInlineNewAddition({ description: '', qty: 1, unit: 'Nos', price: 0, remarks: '', section_id: null })}
                    >
                      <Plus className="h-4 w-4" />Add Additions
                    </Button>
                  )}
                </div>
              </div>

              {/* Single Add Additions dialog — handles both ungrouped and per-section cases.
                  `bulkAdditionSectionId` is set by openAddAdditionFor() before opening. */}
              {canManage && (
                <Dialog open={bulkAdditionDialog} onOpenChange={(v) => { setBulkAdditionDialog(v); if (!v) setBulkAdditionSectionId(null); }}>
                      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            Add Additional Work
                            {bulkAdditionSectionId && (() => {
                              const s = additionSections.find(x => x.section_id === bulkAdditionSectionId);
                              return s ? <span className="ml-2 text-sm text-indigo-600 font-medium">→ {s.title}</span> : null;
                            })()}
                          </DialogTitle>
                          <DialogDescription>
                            {bulkAdditionSectionId
                              ? 'These rows will be added inside the selected section.'
                              : 'Enter Name, Qty, Unit, Unit Rate and (optional) Remarks for each row. Total auto-computed.'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Name *</th>
                                <th className="px-2 py-2 text-left w-20">Qty *</th>
                                <th className="px-2 py-2 text-left w-36">Unit</th>
                                <th className="px-2 py-2 text-right w-28">Unit Rate (₹) *</th>
                                <th className="px-2 py-2 text-right w-28">Total (₹)</th>
                                <th className="px-2 py-2 text-left w-40">Remarks</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkAdditionRows.map((row, idx) => {
                                const rowQty = parseFloat(row.quantity) || 0;
                                const rowRate = parseFloat(row.unit_rate) || 0;
                                const rowTotal = rowQty * rowRate;
                                return (
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
                                    <UnitSelect
                                      value={row.unit}
                                      onChange={(v) => { const r = [...bulkAdditionRows]; r[idx].unit = v; setBulkAdditionRows(r); }}
                                      className="h-8"
                                      data-testid={`addition-unit-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput
                                      value={row.unit_rate}
                                      onChange={(e) => { const r = [...bulkAdditionRows]; r[idx].unit_rate = e.target.value; setBulkAdditionRows(r); }}
                                      className="h-8 text-right"
                                      placeholder="0"
                                      data-testid={`addition-rate-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-right font-semibold text-emerald-700" data-testid={`addition-total-${idx}`}>
                                    ₹{rowTotal.toLocaleString()}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input
                                      value={row.remarks}
                                      onChange={(e) => { const r = [...bulkAdditionRows]; r[idx].remarks = e.target.value; setBulkAdditionRows(r); }}
                                      placeholder="Optional"
                                      className="h-8"
                                      data-testid={`addition-remarks-${idx}`}
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
                              );})}
                            </tbody>
                            <tfoot className="bg-emerald-50 border-t-2">
                              <tr>
                                <td colSpan={5} className="px-2 py-2 text-right font-bold">Grand Total:</td>
                                <td className="px-2 py-2 text-right font-bold text-emerald-700" data-testid="addition-grand-total">
                                  ₹{bulkAdditionRows.reduce((sum, r) => sum + ((parseFloat(r.quantity) || 0) * (parseFloat(r.unit_rate) || 0)), 0).toLocaleString()}
                                </td>
                                <td colSpan={2}></td>
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

              {/* Create Section dialog */}
              {canManage && (
                <Dialog open={newSectionDialog} onOpenChange={setNewSectionDialog}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create Section</DialogTitle>
                      <DialogDescription>Sections group related additions and let you attach reference files.</DialogDescription>
                    </DialogHeader>
                    <div>
                      <Label className="text-sm">Section Title</Label>
                      <Input
                        value={newSectionTitle}
                        onChange={(e) => setNewSectionTitle(e.target.value)}
                        placeholder="e.g., External Works"
                        className="mt-1"
                        data-testid="new-section-title"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSection(); }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setNewSectionDialog(false)}>Cancel</Button>
                      <Button onClick={handleCreateSection} data-testid="create-section-submit">Create</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Bulk Delete All Additions confirmation */}
              {canManage && (
                <Dialog
                  open={deleteAllAdditionsDialog.open}
                  onOpenChange={(o) => !o && !deleteAllAdditionsDialog.submitting && setDeleteAllAdditionsDialog({ open: false, typed: '', submitting: false })}
                >
                  <DialogContent className="max-w-md" data-testid="delete-all-additions-dialog">
                    <DialogHeader>
                      <DialogTitle className="text-red-600 flex items-center gap-2">
                        <Trash2 className="h-5 w-5" /> Delete All Additional Work
                      </DialogTitle>
                      <DialogDescription>
                        This will permanently remove every row under <strong>Additional Work</strong> for this project.
                        Client-approved rows will be skipped unless you are Super Admin.
                        <span className="block mt-2 font-medium text-red-600">Type <strong>delete</strong> below to confirm.</span>
                      </DialogDescription>
                    </DialogHeader>
                    <Input
                      autoFocus
                      placeholder='Type "delete" to enable the button'
                      value={deleteAllAdditionsDialog.typed}
                      onChange={(e) => setDeleteAllAdditionsDialog(d => ({ ...d, typed: e.target.value }))}
                      data-testid="delete-all-additions-typed"
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setDeleteAllAdditionsDialog({ open: false, typed: '', submitting: false })} disabled={deleteAllAdditionsDialog.submitting}>Cancel</Button>
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white"
                        disabled={deleteAllAdditionsDialog.submitting || (deleteAllAdditionsDialog.typed || '').trim().toLowerCase() !== 'delete'}
                        data-testid="delete-all-additions-confirm"
                        onClick={async () => {
                          setDeleteAllAdditionsDialog(d => ({ ...d, submitting: true }));
                          try {
                            const res = await axios.post(`${API}/projects/${projectId}/additional-costs/bulk-delete`, { confirm: 'delete' });
                            toast.success(res.data?.message || 'Deleted');
                            setDeleteAllAdditionsDialog({ open: false, typed: '', submitting: false });
                            fetchData(false);
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Failed to delete');
                            setDeleteAllAdditionsDialog(d => ({ ...d, submitting: false }));
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {deleteAllAdditionsDialog.submitting ? 'Deleting…' : 'Delete All'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Rename Section dialog */}
              {canManage && editingSection && (
                <Dialog open={!!editingSection} onOpenChange={(v) => { if (!v) setEditingSection(null); }}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Rename Section</DialogTitle>
                    </DialogHeader>
                    <div>
                      <Label className="text-sm">Section Title</Label>
                      <Input
                        value={editingSection.title}
                        onChange={(e) => setEditingSection(s => ({ ...s, title: e.target.value }))}
                        className="mt-1"
                        data-testid="rename-section-title"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSection(); }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setEditingSection(null)}>Cancel</Button>
                      <Button onClick={handleRenameSection} data-testid="rename-section-submit">Save</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Group additions by section_id. Ungrouped rows render first; one block per section below. */}
              {(() => {
                const sumGroup = (items) => {
                  // Section/Group footer shows the SUM of every row in the section
                  // regardless of approval status. This is the planner's working total
                  // (gives them visibility into what's been entered). The project-level
                  // rollup elsewhere (Value Cards / Cashflow) continues to count only
                  // client-approved rows — that rule lives on the backend.
                  const total = items.reduce((s, a) => s + (a.estimated_amount || 0), 0);
                  const received = items.reduce((s, a) => s + (a.income_received || 0), 0);
                  return { total, received, balance: total - received };
                };
                const ungrouped = additional_costs.filter(c => !c.section_id);
                const groups = [{ section_id: null, title: 'Ungrouped', isUngrouped: true, attachments: [] }, ...additionSections];
                return groups.map((group) => {
                  const items = group.section_id ? additional_costs.filter(c => c.section_id === group.section_id) : ungrouped;
                  const t = sumGroup(items);
                  return (
                    <div key={group.section_id || 'ungrouped'} className={`mb-6 ${group.section_id ? 'border-2 border-indigo-100 rounded-xl p-4 bg-indigo-50/30' : ''}`} data-testid={`addition-group-${group.section_id || 'ungrouped'}`}>
                      {group.section_id && (
                        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-indigo-700 truncate">{group.title}</h4>
                            {canManage && (
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-indigo-700" onClick={() => setEditingSection({ section_id: group.section_id, title: group.title })} data-testid={`rename-section-${group.section_id}`}>
                                <Edit className="h-3 w-3" />
                              </Button>
                            )}
                            {/* Section-level Pay Request button (Feb 2026).
                                Placed immediately after the section title on the LEFT per
                                user request. Visible ONLY after at least one row has been
                                client-approved — drafts and rejected rows shouldn't allow
                                CRE to start collecting yet. Backend still validates per
                                cost_id at click time. */}
                            {(() => {
                              // Pay Request appears once at least one row in the section is
                              // "client-approved" via ANY of the supported markers:
                              //   - `client_approval_status === 'client_approved'` (new strings)
                              //   - `client_approved === true` (boolean flag set by older flows)
                              //   - `payment_requested === true` (already in pipeline → keep visible
                              //     so Planning can re-trigger if needed)
                              // Excludes rows explicitly client_rejected.
                              const approvedItems = items.filter(c => {
                                const rejected = c.client_approval_status === 'client_rejected' || c.client_rejected === true;
                                if (rejected) return false;
                                const open = (c.balance ?? (c.quantity * c.unit_rate) ?? 0) > 0;
                                if (!open) return false;
                                return c.client_approval_status === 'client_approved'
                                  || c.client_approved === true
                                  || c.payment_requested === true;
                              });
                              if (approvedItems.length === 0) return null;
                              if (!['planning_person', 'planning', 'planning_head', 'super_admin'].includes(user?.role)) return null;
                              const sectionTotal = approvedItems.reduce((sum, c) => sum + (c.balance ?? (c.quantity * c.unit_rate) ?? 0), 0);
                              return (
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-sm"
                                  onClick={() => setReqPayDialog({
                                    open: true,
                                    mode: 'addition_section',
                                    sectionId: group.section_id,
                                    sectionName: group.title,
                                    items: approvedItems,
                                    stage: { stage_id: `section_${group.section_id}`, stage_name: group.title, amount: sectionTotal, amount_received: 0 },
                                    date: '',
                                    submitting: false,
                                  })}
                                  data-testid={`section-pay-request-${group.section_id}`}
                                  title={`Send "${group.title}" to CRE Payment Schedule (${approvedItems.length} client-approved row${approvedItems.length === 1 ? '' : 's'}, ₹${sectionTotal.toLocaleString('en-IN')})`}
                                >
                                  <Send className="h-3 w-3" /> Pay Request
                                </Button>
                              );
                            })()}
                            <Badge variant="outline" className="text-[10px] bg-white">{items.length} {items.length === 1 ? 'addition' : 'additions'}</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1 mr-1 flex-wrap max-w-[260px]">
                              {(group.attachments || []).map(att => (
                                <div key={att.file_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-indigo-200 text-[10px]" title={att.filename}>
                                  <a href={`${API}/files/${att.file_id}/download`} target="_blank" rel="noreferrer" className="text-indigo-700 truncate max-w-[120px]" data-testid={`section-att-${att.file_id}`}>{att.filename}</a>
                                  {canManage && (
                                    <button onClick={() => handleDeleteSectionAttachment(group, att.file_id)} className="text-red-500 hover:text-red-700"><X className="h-2.5 w-2.5" /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                            {canManage && (
                              <>
                                <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-200 bg-white text-[11px] text-indigo-700 cursor-pointer hover:bg-indigo-50" data-testid={`attach-section-${group.section_id}`}>
                                  <Plus className="h-3 w-3" /> File
                                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleUploadSectionAttachment(group, e.target.files[0]); e.target.value = ''; } }} />
                                </label>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-200 text-emerald-700" onClick={() => openAddAdditionFor(group.section_id)} data-testid={`add-into-section-${group.section_id}`}>
                                  <Plus className="h-3 w-3" /> Add
                                </Button>
                                {/* Batch approval chain buttons — show ONE button at a time based on the
                                    most common status in this section. Counts let the user know how many will move. */}
                                {(() => {
                                  const draftN = items.filter(c => !c.approval_status || ['created','rejected'].includes(c.approval_status)).length;
                                  const phN = items.filter(c => c.approval_status === 'ph_review').length;
                                  const gmN = items.filter(c => c.approval_status === 'gm_review').length;
                                  // Section-level Req Payment (Feb 2026, broadened):
                                  // We previously required `c.client_approval_status === 'client_approved'`
                                  // which silently hid the button when the field was stamped under a
                                  // different value (e.g., older `null` / `approved` / missing). Now we
                                  // surface the button for ANY row that has an open balance — the
                                  // backend's per-cost-id payment-request endpoint still enforces the
                                  // proper approval rules, so this just unblocks the trigger.
                                  const reqReadyItems = items.filter(c =>
                                    ((c.balance ?? (c.quantity * c.unit_rate)) > 0)
                                  );
                                  const reqReadyN = reqReadyItems.length;
                                  const reqReadyTotal = reqReadyItems.reduce(
                                    (sum, c) => sum + (c.balance ?? (c.quantity * c.unit_rate)),
                                    0
                                  );
                                  const isPP = ['planning_person', 'planning', 'planning_head', 'super_admin'].includes(user?.role);
                                  const isPH = ['planning', 'planning_head', 'super_admin'].includes(user?.role);
                                  const isGM = user?.role === 'general_manager' || user?.role === 'super_admin';
                                  return (
                                    <>
                                      {draftN > 0 && isPP && (
                                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => submitSectionForReview(group, items)} data-testid={`section-submit-review-${group.section_id}`}>
                                          <Send className="h-3 w-3" /> Submit {draftN} for Review
                                        </Button>
                                      )}
                                      {phN > 0 && isPH && (
                                        <>
                                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => phApproveSection(group, items)} data-testid={`section-ph-approve-${group.section_id}`}>
                                            <CheckCircle2 className="h-3 w-3" /> PH Approve ({phN})
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => phRejectSection(group, items)} data-testid={`section-ph-reject-${group.section_id}`}>
                                            <X className="h-3 w-3" /> Reject
                                          </Button>
                                        </>
                                      )}
                                      {gmN > 0 && isGM && (
                                        <>
                                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => gmApproveSection(group, items)} data-testid={`section-gm-approve-${group.section_id}`}>
                                            <CheckCircle2 className="h-3 w-3" /> GM Approve ({gmN})
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => gmRejectSection(group, items)} data-testid={`section-gm-reject-${group.section_id}`}>
                                            <X className="h-3 w-3" /> Reject
                                          </Button>
                                        </>
                                      )}
                                      {reqReadyN > 0 && isPP && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs gap-1 border-green-500 text-green-700 hover:bg-green-50 font-medium"
                                          onClick={() => setReqPayDialog({
                                            open: true,
                                            mode: 'addition_section',
                                            sectionId: group.section_id,
                                            sectionName: group.name,
                                            items: reqReadyItems,
                                            stage: { stage_id: `section_${group.section_id}`, stage_name: group.name, amount: reqReadyTotal, amount_received: 0 },
                                            date: '',
                                            submitting: false,
                                          })}
                                          data-testid={`section-req-payment-${group.section_id}`}
                                          title={`Send the whole "${group.name}" section to CRE as a single Payment Schedule item (₹${reqReadyTotal.toLocaleString('en-IN')})`}
                                        >
                                          <Send className="h-3 w-3" /> Req Payment ({reqReadyN})
                                        </Button>
                                      )}
                                    </>
                                  );
                                })()}
                                {group.client_approval_status === 'pending_client' && (
                                  <span className="inline-flex items-center text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold" data-testid={`section-pending-client-${group.section_id}`}>Pending Client</span>
                                )}
                                {group.client_approval_status === 'client_approved' && (
                                  <span className="inline-flex items-center text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Client Approved</span>
                                )}
                                {group.client_approval_status === 'client_rejected' && (
                                  <span className="inline-flex items-center text-[10px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-semibold" title={group.client_rejection_reason || ''}>Rejected</span>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDeleteSection(group)} data-testid={`delete-section-${group.section_id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Ungrouped toolbar — parity with section toolbar: File, Add, Send-to-Client batch */}
                      {!group.section_id && items.length > 0 && (
                        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap" data-testid="ungrouped-toolbar">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-gray-600 truncate">Ungrouped</h4>
                            <Badge variant="outline" className="text-[10px] bg-white">{items.length} {items.length === 1 ? 'addition' : 'additions'}</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1 mr-1 flex-wrap max-w-[260px]">
                              {(projectData?.additional_attachments || []).map(att => (
                                <div key={att.file_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[10px]" title={att.filename}>
                                  <a href={`${API}/files/${att.file_id}/download`} target="_blank" rel="noreferrer" className="text-gray-700 truncate max-w-[120px]" data-testid={`ungrouped-att-${att.file_id}`}>{att.filename}</a>
                                  {canManage && (
                                    <button onClick={() => handleDeleteUngroupedAttachment(att.file_id)} className="text-red-500 hover:text-red-700"><X className="h-2.5 w-2.5" /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                            {canManage && (
                              <>
                                <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 cursor-pointer hover:bg-gray-50" data-testid="attach-ungrouped">
                                  <Plus className="h-3 w-3" /> File
                                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleUploadUngroupedAttachment(e.target.files[0]); e.target.value = ''; } }} />
                                </label>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-200 text-emerald-700" onClick={() => openAddAdditionFor(null)} data-testid="add-into-ungrouped">
                                  <Plus className="h-3 w-3" /> Add
                                </Button>
                                {/* Batch chain buttons for Ungrouped — same logic as section toolbar. */}
                                {(() => {
                                  const draftN = items.filter(c => !c.approval_status || ['created','rejected'].includes(c.approval_status)).length;
                                  const phN = items.filter(c => c.approval_status === 'ph_review').length;
                                  const gmN = items.filter(c => c.approval_status === 'gm_review').length;
                                  const isPP = ['planning_person', 'planning', 'planning_head', 'super_admin'].includes(user?.role);
                                  const isPH = ['planning', 'planning_head', 'super_admin'].includes(user?.role);
                                  const isGM = user?.role === 'general_manager' || user?.role === 'super_admin';
                                  return (
                                    <>
                                      {draftN > 0 && isPP && (
                                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => submitSectionForReview({ section_id: null, title: 'Ungrouped' }, items)} data-testid="ungrouped-submit-review">
                                          <Send className="h-3 w-3" /> Submit {draftN} for Review
                                        </Button>
                                      )}
                                      {phN > 0 && isPH && (
                                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => phApproveSection({ section_id: null }, items)} data-testid="ungrouped-ph-approve">
                                          <CheckCircle2 className="h-3 w-3" /> PH Approve ({phN})
                                        </Button>
                                      )}
                                      {gmN > 0 && isGM && (
                                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => gmApproveSection({ section_id: null }, items)} data-testid="ungrouped-gm-approve">
                                          <CheckCircle2 className="h-3 w-3" /> GM Approve ({gmN})
                                        </Button>
                                      )}
                                    </>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        </div>
                      )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-1 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 10 : 9} className="px-4 py-8 text-center text-gray-500">
                          {group.section_id ? 'No additions in this section yet.' : 'No additions recorded yet. Click "Add Additions" for extra work.'}
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={items.map(c => c.cost_id)}
                        onReorder={handleAdditionalCostReorder}
                      >
                      {items.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const qty = cost.qty || 1;
                        const unit = cost.unit || '';
                        const unitRate = cost.price != null ? cost.price : (qty > 0 ? cost.estimated_amount / qty : 0);
                        const isEditing = editingAddition === cost.cost_id;
                        
                        return (
                          <SortableTableRow key={cost.cost_id} id={cost.cost_id} className="hover:bg-gray-50">
                            {({ listeners, attributes }) => (
                              <>
                            <td className="px-1 py-3 text-center"><DragHandle listeners={listeners} attributes={attributes} /></td>
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-addition-name-${cost.cost_id}`}
                                  value={editAdditionForm.item_name}
                                  onChange={(e) => setEditAdditionForm({...editAdditionForm, item_name: e.target.value})}
                                  className="h-8 w-full min-w-[150px]"
                                />
                              ) : (
                                cost.name || cost.description
                              )}
                            </td>
                            <td className="px-3 py-3 text-right text-sm">
                              {isEditing ? (
                                <NumericInput
                                  data-testid={`edit-addition-qty-${cost.cost_id}`}
                                  value={editAdditionForm.quantity}
                                  onChange={(e) => setEditAdditionForm({...editAdditionForm, quantity: e.target.value})}
                                  className="h-8 w-20 text-right"
                                />
                              ) : (
                                qty
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600">
                              {isEditing ? (
                                <UnitSelect
                                  data-testid={`edit-addition-unit-${cost.cost_id}`}
                                  value={editAdditionForm.unit}
                                  onChange={(v) => setEditAdditionForm({...editAdditionForm, unit: v})}
                                  className="w-24"
                                />
                              ) : (
                                unit || '—'
                              )}
                            </td>
                            <td className="px-3 py-3 text-right text-sm">
                              {isEditing ? (
                                <NumericInput
                                  data-testid={`edit-addition-rate-${cost.cost_id}`}
                                  value={editAdditionForm.unit_rate}
                                  onChange={(e) => setEditAdditionForm({...editAdditionForm, unit_rate: e.target.value})}
                                  className="h-8 w-24 text-right"
                                />
                              ) : (
                                `₹${unitRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold">
                              {isEditing ? (
                                `₹${((parseFloat(editAdditionForm.quantity) || 0) * (parseFloat(editAdditionForm.unit_rate) || 0)).toLocaleString()}`
                              ) : (
                                `₹${cost.estimated_amount?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 truncate max-w-[180px]" title={isEditing ? '' : (cost.remarks || '')}>
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-addition-remarks-${cost.cost_id}`}
                                  value={editAdditionForm.remarks}
                                  onChange={(e) => setEditAdditionForm({...editAdditionForm, remarks: e.target.value})}
                                  className="h-8 w-full"
                                  placeholder="Remarks"
                                />
                              ) : (
                                cost.remarks || '—'
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={cost.workflow_status || 'draft'} />
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button
                                        data-testid={`save-addition-${cost.cost_id}`}
                                        variant="ghost"
                                        size="icon"
                                        onClick={saveAdditionInline}
                                        className="h-8 w-8"
                                      >
                                        <Save className="h-4 w-4 text-green-500" />
                                      </Button>
                                      <Button
                                        data-testid={`cancel-addition-edit-${cost.cost_id}`}
                                        variant="ghost"
                                        size="icon"
                                        onClick={cancelAdditionEdit}
                                        className="h-8 w-8"
                                      >
                                        <X className="h-4 w-4 text-gray-500" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                  {/* ── NEW 4-Step Approval Chain UI (PP → PH → GM → Client) ── */}
                                  {/* Once the row enters this chain (approval_status set), this block owns
                                      the status column. Rows that are already in `awaiting_client` fall through
                                      to the legacy "Pending Client / Req Payment" UI below. */}
                                  {balance > 0 && !cost.payment_requested && (
                                    cost.approval_status === 'ph_review' ? (
                                      <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium" data-testid={`add-ph-review-${cost.cost_id}`}>Pending Planning Head</span>
                                    ) : cost.approval_status === 'gm_review' ? (
                                      <span className="text-[11px] px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium" data-testid={`add-gm-review-${cost.cost_id}`}>Pending GM</span>
                                    ) : cost.approval_status === 'rejected' ? (
                                      <>
                                        <span className="text-[11px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium" title={cost.rejection_reason || ''} data-testid={`add-chain-rejected-${cost.cost_id}`}>
                                          Rejected{cost.rejected_at_step ? ` at ${cost.rejected_at_step === 'general_manager' ? 'GM' : 'PH'}` : ''}{cost.rejection_reason ? `: ${cost.rejection_reason.length > 20 ? cost.rejection_reason.slice(0, 20) + '…' : cost.rejection_reason}` : ''}
                                        </span>
                                        {/* Per-row "Resubmit" button removed (Feb 2026) per user request.
                                            Rejected rows now flow through the section-level "Submit N for
                                            Review" button at the section header — that button counts
                                            both draft AND rejected rows (see draftN computation in
                                            section header), so users never need a row-level resubmit. */}
                                      </>
                                    ) : null
                                  )}
                                  {/* Pre-payment client approval gate (legacy + post-GM-approval) — must be cleared before Req Payment. */}
                                  {balance > 0 && !cost.payment_requested && !['ph_review','gm_review','rejected'].includes(cost.approval_status) && (
                                    cost.client_review_requested ? (
                                      <>
                                        <span className="text-[11px] px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-medium" title={cost.client_review_note || ''} data-testid={`add-review-${cost.cost_id}`}>
                                          Review: {cost.client_review_note ? (cost.client_review_note.length > 24 ? cost.client_review_note.slice(0, 24) + '…' : cost.client_review_note) : 'requested'}
                                        </span>
                                        {canManage && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 gap-1 border-violet-500 text-violet-700 hover:bg-violet-50 text-xs"
                                            onClick={() => sendAdditionToClient(cost)}
                                            data-testid={`resend-review-${cost.cost_id}`}
                                            title="After addressing the client's note, resend for approval"
                                          >
                                            <Send className="h-3 w-3" /> Resend
                                          </Button>
                                        )}
                                      </>
                                    ) : cost.client_approval_status === 'pending_client' ? (
                                      <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium" data-testid={`add-pending-client-${cost.cost_id}`}>Pending Client</span>
                                    ) : cost.client_approval_status === 'client_rejected' ? (
                                      <>
                                        <span className="text-[11px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium" title={cost.client_rejection_reason || ''} data-testid={`add-rejected-${cost.cost_id}`}>
                                          Rejected{cost.client_rejection_reason ? `: ${cost.client_rejection_reason.length > 20 ? cost.client_rejection_reason.slice(0, 20) + '…' : cost.client_rejection_reason}` : ''}
                                        </span>
                                        {canManage && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 gap-1 border-violet-500 text-violet-700 hover:bg-violet-50 text-xs"
                                            onClick={() => sendAdditionToClient(cost)}
                                            data-testid={`resend-client-${cost.cost_id}`}
                                          >
                                            <Send className="h-3 w-3" /> Resend
                                          </Button>
                                        )}
                                      </>
                                    ) : cost.client_approval_status === 'client_approved' ? (
                                      // Row-level "Req Payment" button removed (Feb 2026) per user request.
                                      // Planning now uses the SECTION-level "Req Payment N" button at the
                                      // section header, which aggregates every client-approved row into a
                                      // single payment_stage carrying the section title + total. The
                                      // per-row pill mirrors the post-client-approval pipeline so
                                      // Planning can tell at a glance which rows are still waiting on
                                      // CRE collection vs Accountant approval vs paid.
                                      (() => {
                                        const ws = (cost.payment_workflow_status || cost.workflow_status || '').toLowerCase();
                                        const recv = Number(cost.income_received || cost.amount_received || 0);
                                        const tot  = Number(cost.balance ?? (cost.quantity * cost.unit_rate) ?? 0);
                                        if (recv > 0 && recv >= tot - 0.5) {
                                          return <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium" data-testid={`add-paid-${cost.cost_id}`}>✓ Paid</span>;
                                        }
                                        if (ws === 'pending_approval') {
                                          return <span className="text-[11px] px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium" data-testid={`add-acct-waiting-${cost.cost_id}`}>Account Waiting</span>;
                                        }
                                        if (cost.payment_requested) {
                                          return <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium" data-testid={`add-cre-waiting-${cost.cost_id}`}>CRE Waiting</span>;
                                        }
                                        return <span className="text-[11px] px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium" data-testid={`add-client-approved-${cost.cost_id}`}>✓ Client OK</span>;
                                      })()
                                    ) : (
                                      // Default: not yet in approval chain.
                                      // Row-level "Submit for Review" button removed (Feb 2026) per user
                                      // request — Planning now uses the SECTION-level "Submit N for
                                      // Review" button at the section header, which submits every draft
                                      // / rejected row in one click. We render a tiny "Draft" pill so
                                      // the row's status stays legible even without a button.
                                      (user?.role === 'planning_person' || user?.role === 'planning' || user?.role === 'super_admin') && (
                                        <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium" data-testid={`add-draft-${cost.cost_id}`}>Draft</span>
                                      )
                                    )
                                  )}
                                  {/* After Planning hits Req Payment, the row creates a payment_stages doc
                                      and lives on the CRE Payment Schedule. We show "With CRE" so Planning
                                      knows the row is no longer in their hands. The old "Awaiting Client"
                                      legacy state only applies when client never pre-approved. */}
                                  {cost.payment_requested && balance > 0 && (cost.client_approval_status === 'client_approved' || cost.client_approved) && !cost.cre_approved && (
                                    <>
                                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium" data-testid={`add-with-cre-${cost.cost_id}`}>With CRE · Payment Schedule</span>
                                      {(user?.role === 'planning_person' || user?.role === 'planning' || user?.role === 'super_admin') && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 gap-1 border-amber-500 text-amber-700 hover:bg-amber-50 text-xs"
                                          onClick={async () => {
                                            if (!window.confirm(`Undo Req Payment for "${cost.description || cost.name || 'this item'}"? It will be removed from the CRE Payment Schedule and you can request again later.`)) return;
                                            try {
                                              await axios.post(`${API}/additional-costs/${cost.cost_id}/cancel-payment-request`);
                                              toast.success('Req Payment undone');
                                              fetchData(false);
                                            } catch (e) { toast.error(e.response?.data?.detail || 'Failed to undo'); }
                                          }}
                                          data-testid={`undo-req-payment-${cost.cost_id}`}
                                          title="Withdraw Req Payment (only allowed before CRE approves / money is collected)"
                                        >
                                          <Undo2 className="h-3 w-3" /> Undo
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  {cost.payment_requested && balance > 0 && !(cost.client_approval_status === 'client_approved' || cost.client_approved) && !cost.client_rejected && (
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
                                  {/* Undo / Recall — visible while client hasn't approved yet (pending OR rejected).
                                      Lets Planning pull the row back without bothering the client. */}
                                  {(cost.client_approval_status === 'pending_client' || cost.client_approval_status === 'client_rejected') && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRecallAddition(cost)}
                                      data-testid={`undo-send-${cost.cost_id}`}
                                      title="Undo / Recall from client"
                                      className="h-8 w-8"
                                    >
                                      <Undo2 className="h-4 w-4 text-orange-600" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openAdditionEdit(cost)}
                                    data-testid={`edit-addition-${cost.cost_id}`}
                                    title="Edit inline"
                                    className="h-8 w-8"
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                  </Button>
                                  {/* Delete — once client has approved, only Super Admin can delete.
                                      Show a disabled lock for everyone else with a tooltip. */}
                                  {(cost.client_approval_status === 'client_approved' || cost.client_approved) ? (
                                    user?.role === 'super_admin' ? (
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)} className="h-8 w-8" data-testid={`delete-addition-${cost.cost_id}`} title="Super Admin override delete">
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    ) : (
                                      <Button variant="ghost" size="icon" disabled className="h-8 w-8 opacity-40 cursor-not-allowed" title="Locked — client has approved. Ask Super Admin to delete." data-testid={`delete-locked-${cost.cost_id}`}>
                                        <Lock className="h-4 w-4 text-gray-400" />
                                      </Button>
                                    )
                                  ) : (
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)} className="h-8 w-8" data-testid={`delete-addition-${cost.cost_id}`}>
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  )}
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
                    {/* Inline Add New Addition Row — only on ungrouped block */}
                    {canManage && group.isUngrouped && inlineNewAddition && (
                      <tr className="bg-emerald-50/40 border-y border-emerald-200" data-testid="inline-add-addition-row">
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2 text-xs text-emerald-700 font-medium">New</td>
                        <td className="px-2 py-2">
                          <Input
                            autoFocus
                            placeholder="Description…"
                            value={inlineNewAddition.description}
                            onChange={(e) => setInlineNewAddition(r => ({ ...r, description: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveInlineAddition(); if (e.key === 'Escape') setInlineNewAddition(null); }}
                            className="h-8 text-sm" data-testid="inline-addition-desc"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" min={0} step="0.01" value={inlineNewAddition.qty}
                            onChange={(e) => setInlineNewAddition(r => ({ ...r, qty: e.target.value }))}
                            className="h-8 text-sm w-20" data-testid="inline-addition-qty" />
                        </td>
                        <td className="px-2 py-2">
                          <UnitSelect value={inlineNewAddition.unit}
                            onChange={(v) => setInlineNewAddition(r => ({ ...r, unit: v }))}
                            className="h-8" data-testid="inline-addition-unit" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" min={0} step="0.01" value={inlineNewAddition.price}
                            onChange={(e) => setInlineNewAddition(r => ({ ...r, price: e.target.value }))}
                            className="h-8 text-sm w-24" data-testid="inline-addition-price" />
                        </td>
                        <td className="px-2 py-2 text-right text-sm font-medium text-amber-700">
                          ₹{((parseFloat(inlineNewAddition.qty) || 0) * (parseFloat(inlineNewAddition.price) || 0)).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-400">—</td>
                        <td className="px-2 py-2 text-xs text-gray-400">—</td>
                        <td className="px-2 py-2">
                          <Input placeholder="Remarks" value={inlineNewAddition.remarks}
                            onChange={(e) => setInlineNewAddition(r => ({ ...r, remarks: e.target.value }))}
                            className="h-8 text-xs" data-testid="inline-addition-remarks" />
                        </td>
                        {canManage && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            <Button size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 mr-1" onClick={saveInlineAddition} data-testid="inline-addition-save">Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500" onClick={() => setInlineNewAddition(null)} data-testid="inline-addition-cancel">Cancel</Button>
                          </td>
                        )}
                      </tr>
                    )}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot className="bg-cyan-50 border-t-2">
                      <tr>
                        <td colSpan="6" className="px-4 py-3 text-right font-bold">Total:</td>
                        <td className="px-3 py-3 text-right font-bold">₹{t.total.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2} className="px-3 py-3 text-right text-xs text-gray-600">
                          <span className="text-green-700">Received ₹{t.received.toLocaleString()}</span>
                          <span className="mx-2 text-gray-300">·</span>
                          <span className={t.balance > 0 ? 'text-red-600' : 'text-green-600'}>Balance ₹{t.balance.toLocaleString()}</span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
                    </div>
                  );
                });
              })()}
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
                  {canManageAdditionsDeductions && (
                    <Button
                      data-testid="add-deduction-section-btn"
                      variant="outline"
                      className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => setNewDedSectionDialog(true)}
                    >
                      <Plus className="h-4 w-4" />Create Section
                    </Button>
                  )}
                  {canManageAdditionsDeductions && (
                    <Button
                      data-testid="add-deduction-btn"
                      className="gap-2 bg-orange-600 hover:bg-orange-700 hidden"
                      onClick={() => { setInlineDeductionSectionId(null); setInlineNewDeduction({ description: '', qty: 1, unit: 'Nos', price: 0, remarks: '' }); }}
                    >
                      <MinusCircle className="h-4 w-4" />Add Deductions
                    </Button>
                  )}
                  {/* Bulk-add dialog kept for power-users; trigger removed in favor of inline */}
                  {canManage && (
                    <Dialog open={bulkDeductionDialog} onOpenChange={setBulkDeductionDialog}>
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

              {/* Create / Rename Section dialogs (kept outside the per-section
                  loop so they don't unmount when sections re-render). */}
              <Dialog open={newDedSectionDialog} onOpenChange={setNewDedSectionDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Deduction Section</DialogTitle>
                    <DialogDescription>Group related deductions under a folder (e.g., "Quality Penalties").</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input
                      autoFocus
                      placeholder="Section title…"
                      value={newDedSectionTitle}
                      onChange={(e) => setNewDedSectionTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDedSection(); }}
                      data-testid="new-ded-section-title"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setNewDedSectionDialog(false); setNewDedSectionTitle(''); }}>Cancel</Button>
                    <Button onClick={handleCreateDedSection} data-testid="create-ded-section-submit">Create</Button>
                  </div>
                </DialogContent>
              </Dialog>
              {editingDedSection && (
                <Dialog open={!!editingDedSection} onOpenChange={(o) => !o && setEditingDedSection(null)}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Rename Section</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input
                        autoFocus
                        value={editingDedSection.title}
                        onChange={(e) => setEditingDedSection(s => ({ ...s, title: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameDedSection(); }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setEditingDedSection(null)}>Cancel</Button>
                      <Button onClick={handleRenameDedSection} data-testid="rename-ded-section-submit">Save</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* ── Per-Section Nested Rendering ────────────────────────────────
                  Each section renders as its own card with a header bar (title,
                  count, total, role-aware batch buttons + delete) and a mini
                  table of just that section's rows. Ungrouped deductions appear
                  in a final "Ungrouped" block. The inline-add row is rendered
                  inside whichever group the user clicked "+ Add" on. */}
              {(() => {
                const groups = [
                  ...deductionSections.map(s => ({ ...s, isUngrouped: false })),
                  { section_id: null, title: 'Ungrouped', isUngrouped: true },
                ];
                const renderGroup = (group) => {
                  const items = (deductions || []).filter(d => (d.section_id || null) === (group.section_id || null));
                  // Hide ungrouped block when empty AND sections exist (avoid empty noise).
                  if (group.isUngrouped && items.length === 0 && deductionSections.length > 0 && !(inlineNewDeduction && !inlineDeductionSectionId)) return null;
                  if (!group.isUngrouped && items.length === 0 && !(inlineNewDeduction && inlineDeductionSectionId === group.section_id)) {
                    // Section with no rows yet — still show header with Add/Delete so user can populate it.
                  }
                  const total = items.reduce((s, d) => s + (d.amount || 0), 0);
                  const draftN = items.filter(d => !d.approval_status || ['created','rejected'].includes(d.approval_status)).length;
                  const phN = items.filter(d => d.approval_status === 'ph_review').length;
                  const gmN = items.filter(d => d.approval_status === 'gm_review').length;
                  const isPP = user?.role === 'planning_person' || user?.role === 'planning' || user?.role === 'super_admin';
                  const isPH = user?.role === 'planning' || user?.role === 'super_admin';
                  const isGM = user?.role === 'general_manager' || user?.role === 'super_admin';
                  const inlineHere = inlineNewDeduction && (inlineDeductionSectionId || null) === (group.section_id || null);
                  return (
                    <div key={group.section_id || 'ungrouped'} className={`mb-4 border-2 ${group.isUngrouped ? 'border-gray-200 bg-white' : 'border-orange-100 bg-orange-50/30'} rounded-xl overflow-hidden`} data-testid={`ded-group-${group.section_id || 'ungrouped'}`}>
                      <div className={`${group.isUngrouped ? 'bg-gray-50' : 'bg-orange-50'} px-3 py-2 flex items-center justify-between gap-2 flex-wrap`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <h4 className={`text-sm font-bold ${group.isUngrouped ? 'text-gray-700' : 'text-orange-700'} truncate`}>{group.title}</h4>
                          {!group.isUngrouped && canManageAdditionsDeductions && (
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-orange-700" onClick={() => setEditingDedSection({ section_id: group.section_id, title: group.title })} data-testid={`rename-ded-section-${group.section_id}`}>
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                          <Badge variant="outline" className="text-[10px] bg-white">{items.length} {items.length === 1 ? 'deduction' : 'deductions'}</Badge>
                          <span className="text-xs text-gray-600">Total: <span className={`font-bold ${group.isUngrouped ? 'text-gray-800' : 'text-orange-700'}`}>-₹{Number(total).toLocaleString('en-IN')}</span></span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {canManageAdditionsDeductions && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => openAddDeductionFor(group.section_id || null)} data-testid={`add-into-ded-${group.section_id || 'ungrouped'}`}>
                              <Plus className="h-3 w-3" /> Add
                            </Button>
                          )}
                          {!group.isUngrouped && canManageAdditionsDeductions && (
                            <>
                              {/* File attach button — same pattern as additional sections.
                                  Hidden label input keeps the look clean while still using
                                  the native file picker. */}
                              <label className="inline-flex items-center" data-testid={`ded-section-attach-label-${group.section_id}`}>
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files && e.target.files[0];
                                    if (f) handleUploadDedSectionAttachment(group, f);
                                    e.target.value = '';
                                  }}
                                  data-testid={`ded-section-attach-input-${group.section_id}`}
                                />
                                <span className="h-7 px-2 text-xs gap-1 border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-md inline-flex items-center cursor-pointer">
                                  <Paperclip className="h-3 w-3" /> Attach{(group.attachments || []).length > 0 ? ` (${group.attachments.length})` : ''}
                                </span>
                              </label>
                            </>
                          )}
                          {draftN > 0 && isPP && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => submitDedSectionForReview(group, items)} data-testid={`ded-section-submit-review-${group.section_id || 'ungrouped'}`}>
                              <Send className="h-3 w-3" /> Submit {draftN} for Review
                            </Button>
                          )}
                          {phN > 0 && isPH && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => phApproveDedSection(group, items)} data-testid={`ded-section-ph-approve-${group.section_id || 'ungrouped'}`}>
                              <CheckCircle2 className="h-3 w-3" /> PH Approve ({phN})
                            </Button>
                          )}
                          {gmN > 0 && isGM && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => gmApproveDedSection(group, items)} data-testid={`ded-section-gm-approve-${group.section_id || 'ungrouped'}`}>
                              <CheckCircle2 className="h-3 w-3" /> GM Approve ({gmN})
                            </Button>
                          )}
                          {!group.isUngrouped && canManageAdditionsDeductions && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDeleteDedSection(group)} data-testid={`delete-ded-section-${group.section_id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-white border-b">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                              {canManage && <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {items.length === 0 && !inlineHere ? (
                              <tr><td colSpan={canManage ? 9 : 8} className="px-4 py-6 text-center text-xs text-gray-400 italic">No deductions in this section yet. Use "+ Add" above.</td></tr>
                            ) : items.map((d, idx) => (
                              <tr key={d.deduction_id} className="hover:bg-gray-50" data-testid={`deduction-row-${d.deduction_id}`}>
                                {renderDeductionRowCells(d, idx)}
                              </tr>
                            ))}
                            {/* Inline Add row — only renders inside the group that was clicked */}
                            {canManage && inlineHere && (
                              <tr className="bg-emerald-50/40 border-y border-emerald-200" data-testid={`inline-add-deduction-row-${group.section_id || 'ungrouped'}`}>
                                <td className="px-2 py-2 text-xs text-emerald-700 font-medium">New</td>
                                <td className="px-2 py-2">
                                  <Input
                                    autoFocus
                                    placeholder="Description…"
                                    value={inlineNewDeduction.description}
                                    onChange={(e) => setInlineNewDeduction(r => ({ ...r, description: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveInlineDeduction(); if (e.key === 'Escape') { setInlineNewDeduction(null); setInlineDeductionSectionId(null); } }}
                                    className="h-8 text-sm" data-testid="inline-deduction-desc"
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <Input type="number" min={0} step="0.01" value={inlineNewDeduction.qty}
                                    onChange={(e) => setInlineNewDeduction(r => ({ ...r, qty: e.target.value }))}
                                    className="h-8 text-sm w-20" data-testid="inline-deduction-qty" />
                                </td>
                                <td className="px-2 py-2">
                                  <UnitSelect value={inlineNewDeduction.unit}
                                    onChange={(v) => setInlineNewDeduction(r => ({ ...r, unit: v }))}
                                    className="h-8" data-testid="inline-deduction-unit" />
                                </td>
                                <td className="px-2 py-2">
                                  <Input type="number" min={0} step="0.01" value={inlineNewDeduction.price}
                                    onChange={(e) => setInlineNewDeduction(r => ({ ...r, price: e.target.value }))}
                                    className="h-8 text-sm w-24" data-testid="inline-deduction-price" />
                                </td>
                                <td className="px-2 py-2 text-right text-sm font-medium text-orange-700">
                                  -₹{((parseFloat(inlineNewDeduction.qty) || 0) * (parseFloat(inlineNewDeduction.price) || 0)).toLocaleString()}
                                </td>
                                <td className="px-2 py-2">
                                  <Input placeholder="Remarks…" value={inlineNewDeduction.remarks || ''}
                                    onChange={(e) => setInlineNewDeduction(r => ({ ...r, remarks: e.target.value }))}
                                    className="h-8 text-sm" data-testid="inline-deduction-remarks" />
                                </td>
                                <td className="px-2 py-2"></td>
                                {canManage && (
                                  <td className="px-2 py-2 whitespace-nowrap">
                                    <Button size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 mr-1" onClick={saveInlineDeduction} data-testid="inline-deduction-save">Save</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500" onClick={() => { setInlineNewDeduction(null); setInlineDeductionSectionId(null); }} data-testid="inline-deduction-cancel">Cancel</Button>
                                  </td>
                                )}
                              </tr>
                            )}
                          </tbody>
                          {items.length > 0 && (
                            <tfoot className="bg-orange-50/60 border-t">
                              <tr>
                                <td colSpan="5" className="px-4 py-2 text-right font-semibold text-gray-700">Total Deductions:</td>
                                <td className="px-3 py-2 text-right font-bold text-orange-700">
                                  -₹{Number(items.reduce((s, d) => s + (d.amount || 0), 0)).toLocaleString('en-IN')}
                                </td>
                                <td colSpan={canManage ? 3 : 2}></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {/* Attachments strip: shows uploaded files with download/delete affordances. */}
                      {!group.isUngrouped && (group.attachments || []).length > 0 && (
                        <div className="px-3 py-2 bg-white border-t flex flex-wrap gap-2" data-testid={`ded-section-attachments-${group.section_id}`}>
                          {group.attachments.map(att => (
                            <a
                              key={att.file_id}
                              href={`${API}/files/${att.file_id}/download`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-sky-50 border border-sky-200 rounded text-xs text-sky-700 hover:bg-sky-100"
                              title={att.filename}
                              data-testid={`ded-section-att-${att.file_id}`}
                            >
                              <Paperclip className="h-3 w-3" />
                              <span className="truncate max-w-[160px]">{att.filename}</span>
                              {canManageAdditionsDeductions && (
                                <button
                                  onClick={(e) => { e.preventDefault(); handleDeleteDedSectionAttachment(group, att.file_id); }}
                                  className="ml-1 text-rose-400 hover:text-rose-600"
                                  data-testid={`ded-section-att-delete-${att.file_id}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                };
                return groups.map(renderGroup);
              })()}

              {/* Grand Total — across all sections + ungrouped */}
              {deductions.length > 0 && (
                <div className="bg-orange-50 border-2 border-orange-200 rounded-lg px-4 py-3 flex items-center justify-between" data-testid="ded-grand-total">
                  <span className="font-bold text-gray-700">Total Deductions:</span>
                  <span className="font-bold text-orange-700 text-lg">-₹{Number(deductions.reduce((s, d) => s + (d.amount || 0), 0)).toLocaleString('en-IN')}</span>
                </div>
              )}
            </TabsContent>
            {/* ==================== PAYMENT SUMMARY TAB ==================== */}
            <TabsContent value="payment-summary" className="p-3 sm:p-6">
              {(user?.role === 'planning_person' || user?.role === 'planning') ? (
                /* Planning Head / Planning Person don't see the Cashflow Engine
                   (project-finance internals). They land directly on the Cheques view. */
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
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price (₹/unit)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {projectMaterials.map((m, idx) => (
                                <tr key={idx} className="hover:bg-gray-50" data-testid={`proj-mat-view-${idx}`}>
                                  <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                                  <td className="px-3 py-2.5 font-medium">{m.name || '-'}</td>
                                  <td className="px-3 py-2.5">{m.brand ? <Badge variant="outline" className="text-xs">{m.brand}</Badge> : <span className="text-gray-400">-</span>}</td>
                                  <td className="px-3 py-2.5 text-gray-700">{m.unit || <span className="text-gray-400">-</span>}</td>
                                  <td className="px-3 py-2.5 text-right font-medium">{(m.price && Number(m.price) > 0) ? `₹${Number(m.price).toLocaleString('en-IN')}` : <span className="text-gray-400">-</span>}</td>
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
                                {/* Unit + Price row — small, secondary fields, kept compact below
                                    the primary Material + Brand picker so screen real estate stays tidy. */}
                                <div className="flex items-center gap-2 mt-2 pl-8">
                                  <div className="flex-1 max-w-[180px]">
                                    <Label className="text-[10px] text-gray-500 uppercase">Unit</Label>
                                    <UnitSelect value={m.unit || ''} onChange={(v) => updateProjectMaterial(idx, 'unit', v)} className="h-9" data-testid={`proj-mat-unit-${idx}`} />
                                  </div>
                                  <div className="flex-1 max-w-[200px]">
                                    <Label className="text-[10px] text-gray-500 uppercase">Price (₹/unit)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={m.price ?? ''}
                                      placeholder="0"
                                      onChange={(e) => updateProjectMaterial(idx, 'price', e.target.value === '' ? '' : parseFloat(e.target.value))}
                                      className="h-9 text-sm"
                                      data-testid={`proj-mat-price-${idx}`}
                                    />
                                  </div>
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
                                  <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => openSaveWoTemplate(wo)} data-testid={`wo-save-template-${wo.work_order_id}`}>
                                    <Plus className="h-3 w-3 mr-1" />Save as Template
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => openWoDialog(wo)} data-testid="wo-edit-btn"><Edit className="h-3 w-3 mr-1" />Edit</Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleDeleteWo(wo)} data-testid="wo-delete-btn"><Trash2 className="h-3 w-3" /></Button>
                                </>
                              )}
                              </div>
                            </div>
                          </div>
                          <Tabs defaultValue="scope" className="w-full">
                            <TabsList className="w-full rounded-none border-b bg-white h-auto p-0 gap-0">
                              <TabsTrigger value="scope" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5">Scope ({wo.scope_items?.length || 0})</TabsTrigger>
                              <TabsTrigger value="stages" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5">Stages ({wo.stages?.length || 0})</TabsTrigger>
                              <TabsTrigger value="additional" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5">Additional ({wo.additional_work?.length || 0})</TabsTrigger>
                              <TabsTrigger value="dlr" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5" data-testid="wo-dlr-tab">DLR</TabsTrigger>
                              <TabsTrigger value="rab" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5" data-testid="wo-rab-tab">RAB</TabsTrigger>
                            </TabsList>
                            <TabsContent value="scope" className="p-3">
                              {wo.scope_items?.length > 0 ? (
                                <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead>
                                <tbody className="divide-y">{(wo.scope_items || []).map((s, i) => (<tr key={i}><td className="px-3 py-2 text-xs text-gray-400">{i+1}</td><td className="px-3 py-2 font-medium">{s.name}</td><td className="px-3 py-2">{s.unit}</td><td className="px-3 py-2 text-right">{s.quantity}</td><td className="px-3 py-2 text-right">{formatCurrency(s.unit_rate)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(s.total)}</td></tr>))}</tbody>
                                <tfoot className="border-t"><tr><td colSpan="5" className="px-3 py-2 text-right font-bold text-xs">Scope Total:</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(wo.scope_total)}</td></tr></tfoot></table>
                              ) : <p className="text-gray-400 text-center py-4 text-sm">No scope items</p>}
                            </TabsContent>
                            <TabsContent value="stages" className="p-3">
                              {wo.stages?.length > 0 ? (() => {
                                const counts = { open: 0, locked: 0, completed: 0, all: wo.stages.length };
                                wo.stages.forEach(s => { counts[stageBucketOf(s)]++; });
                                const filteredStages = stagesBucket === 'all'
                                  ? wo.stages.map((st, i) => ({ st, i }))
                                  : wo.stages.map((st, i) => ({ st, i })).filter(({ st }) => stageBucketOf(st) === stagesBucket);
                                return (
                                <div className="space-y-2">
                                  {/* Sub-tab segmentation: Open | Locked | Completed | All */}
                                  <div className="flex items-center gap-2 mb-3 pb-1 overflow-x-auto" data-testid="wo-stages-subtabs">
                                    {[
                                      { id: 'open',      label: 'Open',      cnt: counts.open,      base: 'border-emerald-300 bg-emerald-50 text-emerald-800', active: 'border-emerald-600 bg-emerald-100 ring-2 ring-emerald-300 text-emerald-900' },
                                      { id: 'locked',    label: 'Locked',    cnt: counts.locked,    base: 'border-gray-300 bg-gray-50 text-gray-700',          active: 'border-gray-500 bg-gray-200 ring-2 ring-gray-300 text-gray-900' },
                                      { id: 'completed', label: 'Completed', cnt: counts.completed, base: 'border-teal-300 bg-teal-50 text-teal-800',          active: 'border-teal-600 bg-teal-100 ring-2 ring-teal-300 text-teal-900' },
                                      { id: 'all',       label: 'All',       cnt: counts.all,       base: 'border-violet-300 bg-violet-50 text-violet-800',    active: 'border-violet-600 bg-violet-100 ring-2 ring-violet-300 text-violet-900' },
                                    ].map(t => {
                                      const isActive = stagesBucket === t.id;
                                      return (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => setStagesBucket(t.id)}
                                          className={`px-3 py-1.5 text-xs font-semibold rounded-md border-2 transition whitespace-nowrap shadow-sm ${isActive ? t.active : t.base + ' hover:brightness-95'}`}
                                          data-testid={`wo-stages-subtab-${t.id}`}
                                        >
                                          {t.label}
                                          <span className={`ml-1.5 text-[10px] font-bold ${isActive ? '' : 'opacity-70'}`}>({t.cnt})</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {filteredStages.length === 0 ? (
                                    <p className="text-gray-400 text-center py-6 text-sm" data-testid="wo-stages-empty">No stages in this bucket.</p>
                                  ) : filteredStages.map(({ st, i }) => {
                                    // Compute released + in-approval totals once so the stage
                                    // header + summary chips stay in sync without duplicating logic.
                                    const released = (st.payment_requests || []).filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
                                    const inApproval = (st.payment_requests || []).filter(p => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(p.status)).reduce((s, p) => s + (p.requested_amount || 0), 0);
                                    const balance = Math.max(0, (Number(st.amount) || 0) - released);
                                    const stWithFlag = { ...st, _fullyPaid: (Number(st.amount) || 0) > 0 && released >= (Number(st.amount) || 0) };
                                    const cfg = getStageStatusConfig(st.status, st.is_open, stWithFlag);
                                    const showApprove = canApproveStage(st);
                                    const isExpanded = expandedWoStages[st.stage_id];
                                    const isStageOpen = st.is_open === true;
                                    const isCompleted = stWithFlag._fullyPaid;
                                    return (
                                      <div key={st.stage_id || i} className={`border rounded-lg overflow-hidden`} data-testid={`wo-stage-${st.stage_id}`}>
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
                                            <div className="text-xs text-gray-500">Amount: <strong>{formatCurrency(st.amount)}</strong></div>
                                            {/* Summary chips — shown on every stage regardless of lock state */}
                                            <div className="flex flex-wrap gap-1.5">
                                              <span className="text-[11px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Contract <strong>{formatCurrency(st.amount)}</strong></span>
                                              {released > 0 && <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Advance Approved <strong>{formatCurrency(released)}</strong></span>}
                                              <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full">Balance <strong>{formatCurrency(balance)}</strong></span>
                                              {inApproval > 0 && <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">In Approval <strong>{formatCurrency(inApproval)}</strong></span>}
                                            </div>
                                            {isStageOpen && st.opened_by_name && (
                                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">Opened by {st.opened_by_name}</span>
                                            )}
                                            <div className="flex gap-1 flex-wrap pt-1">
                                              {/* Planning / Planning Person / Super-Admin: Open/Lock toggle on every stage (except already-completed) */}
                                              {['planning', 'planning_person', 'super_admin'].includes(user?.role) && !isCompleted && (
                                                isStageOpen ? (
                                                  <Button size="sm" variant="outline" className="h-7 text-xs border-gray-400 text-gray-700 hover:bg-gray-100" data-testid={`wo-stage-lock-${st.stage_id}`}
                                                    onClick={(e) => { e.stopPropagation(); handleLockStage(wo.work_order_id, st.stage_id); }}>
                                                    <Lock className="h-3 w-3 mr-1" /> Lock Stage
                                                  </Button>
                                                ) : (
                                                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" data-testid={`wo-stage-open-${st.stage_id}`}
                                                    onClick={(e) => { e.stopPropagation(); handleOpenStage(wo.work_order_id, st.stage_id); }}>
                                                    <Unlock className="h-3 w-3 mr-1" /> Open Stage
                                                  </Button>
                                                )
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
                                              {/* SE: Request Payment (RAB) on any open, unfinished stage */}
                                              {st.is_open && st.stage_status !== 'finished' && ['site_engineer', 'sr_site_engineer'].includes(user?.role) && (
                                                <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" data-testid={`wo-stage-request-${st.stage_id}`}
                                                  onClick={(e) => { e.stopPropagation(); handleWoStageRequestPayment(wo.work_order_id, st.stage_id); }}>
                                                  <Send className="h-3 w-3 mr-1" /> Req Payment (RAB)
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {/* Total summary — always reflects ALL stages (not filtered) */}
                                  <div className="flex justify-between items-center px-3 pt-2 border-t">
                                    <span className="text-xs font-bold text-gray-500">Stage Total</span>
                                    <span className="text-sm font-bold">{formatCurrency(wo.stages.reduce((sum, s) => sum + (s.amount || 0), 0))}</span>
                                  </div>
                                </div>
                                );
                              })() : <p className="text-gray-400 text-center py-4 text-sm">No stages</p>}
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
                            <TabsContent value="rab" className="p-3" data-testid="wo-rab-content">
                              <WORABTab
                                projectId={projectId}
                                workOrder={wo}
                                onOpenRabView={(requestId) => setRabView({ open: true, projectId, workOrderId: wo.work_order_id, requestId })}
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
                            {/* View RAB ladder — popup with every RAB raised on this WO. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-violet-600 hover:text-violet-800 hover:bg-violet-50"
                              onClick={() => setRabView({ open: true, projectId, workOrderId: wo.work_order_id, requestId: null })}
                              title="View RAB chain"
                              data-testid={`wo-view-rab-${wo.work_order_id}`}
                            ><Eye className="h-3.5 w-3.5" /></Button>
                            </div>
                          </div>
                        </div>
                      </div>);
                    })}
                  </div>
                )}
              </div>

              {/* Work Order Create/Edit Dialog */}
              <Dialog open={woDialog} onOpenChange={(o) => { setWoDialog(o); if (!o) { setEditingTemplate(null); setEditingTemplateName(''); } }}>
                <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
                  <DialogHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <DialogTitle>
                          {editingTemplate ? (
                            <span className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-violet-600 inline" /> Edit Template
                            </span>
                          ) : editingWo ? 'Edit Work Order' : 'Create New Work Order'}
                        </DialogTitle>
                        <DialogDescription>
                          {editingTemplate
                            ? 'Templates are contractor-agnostic. Update Scope / Stages / Additional below — these will be reused next time someone applies this template.'
                            : 'Select a contractor and define scope, additions, deductions, and payment stages.'}
                        </DialogDescription>
                        {editingTemplate && (
                          <div className="mt-2">
                            <Label className="text-xs">Template Name *</Label>
                            <Input
                              className="h-9 mt-1"
                              value={editingTemplateName}
                              onChange={(e) => setEditingTemplateName(e.target.value)}
                              placeholder="Template name"
                              data-testid="tpl-edit-name"
                            />
                          </div>
                        )}
                      </div>
                      {!editingWo && !editingTemplate && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-violet-300 text-violet-700 hover:bg-violet-50 gap-1 shrink-0"
                          onClick={() => setUseWoTplDialog(true)}
                          data-testid="wo-use-template-btn"
                        >
                          <FileText className="h-3.5 w-3.5" /> Use Template
                          {woTemplates.length > 0 && <Badge className="ml-1 bg-violet-100 text-violet-700 text-[10px]">{woTemplates.length}</Badge>}
                        </Button>
                      )}
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {/* Contractor Selection — hidden when editing a template (templates are contractor-agnostic). */}
                    {!editingTemplate && (
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
                    )}
                    <div data-testid="wo-notes-section">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Notes</Label>
                        <div className="flex items-center gap-2">
                          <Select
                            value=""
                            onValueChange={(val) => {
                              if (val === '__add__') {
                                setAddTplDialog({ open: true, text: woForm.notes || '', submitting: false });
                              } else if (val) {
                                const t = woNoteTemplates.find(x => x.template_id === val);
                                if (t) setWoForm(f => ({ ...f, notes: t.text }));
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 w-56 text-xs" data-testid="wo-notes-template-picker">
                              <SelectValue placeholder="Pick saved template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__add__" className="text-green-700">
                                <Plus className="h-3 w-3 inline mr-1" />Add New Template
                              </SelectItem>
                              {woNoteTemplates.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-400">No templates yet</div>
                              ) : woNoteTemplates.map(t => (
                                <div key={t.template_id} className="flex items-center justify-between pr-1 hover:bg-gray-50">
                                  <SelectItem value={t.template_id} className="flex-1 cursor-pointer">
                                    <span className="text-xs truncate" title={t.text}>{t.label || t.text}</span>
                                  </SelectItem>
                                  <button
                                    type="button"
                                    className="text-red-500 hover:text-red-700 p-1"
                                    onClick={(e) => {
                                      e.preventDefault(); e.stopPropagation();
                                      setDelTplDialog({ open: true, template: t, submitting: false });
                                    }}
                                    data-testid={`delete-wo-template-${t.template_id}`}
                                    title="Delete template"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Textarea value={woForm.notes} onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))} placeholder="Pick a template or type custom notes…" rows={2} data-testid="wo-notes" />
                    </div>

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
                    <Button variant="outline" onClick={() => { setWoDialog(false); setEditingTemplate(null); setEditingTemplateName(''); }}>Cancel</Button>
                    <Button
                      onClick={editingTemplate ? handleSaveTemplateEdit : handleSaveWo}
                      className="bg-violet-600 hover:bg-violet-700"
                      data-testid="wo-save-btn"
                    >
                      {editingTemplate ? 'Save Template' : (editingWo ? 'Update Work Order' : 'Create Work Order')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ======= SAVE WORK ORDER AS TEMPLATE DIALOG ======= */}
              <Dialog open={saveWoTplDialog.open} onOpenChange={(o) => !o && setSaveWoTplDialog({ open: false, sourceWo: null, name: '', submitting: false })}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Save Work Order as Template</DialogTitle>
                    <DialogDescription>
                      Snapshots Scope, Stages, Additional & Deductions into a reusable template. Contractor is not saved — it's picked fresh each time.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    {saveWoTplDialog.sourceWo && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                        Saving from: <span className="font-semibold text-gray-700">{saveWoTplDialog.sourceWo.contractor_name}</span>
                        <span className="mx-1">·</span>
                        Scope {saveWoTplDialog.sourceWo.scope_items?.length || 0} · Stages {saveWoTplDialog.sourceWo.stages?.length || 0} · Additional {saveWoTplDialog.sourceWo.additional_work?.length || 0}
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Template Name *</Label>
                      <Input
                        className="h-9 mt-1"
                        value={saveWoTplDialog.name}
                        onChange={(e) => setSaveWoTplDialog(s => ({ ...s, name: e.target.value }))}
                        placeholder="e.g., Civil — 2-Storey Standard"
                        autoFocus
                        data-testid="wo-save-template-name"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSaveWoTplDialog({ open: false, sourceWo: null, name: '', submitting: false })}>Cancel</Button>
                    <Button onClick={handleSaveWoTemplate} disabled={saveWoTplDialog.submitting} className="bg-violet-600 hover:bg-violet-700" data-testid="wo-save-template-submit">
                      {saveWoTplDialog.submitting ? 'Saving…' : 'Save Template'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ======= USE WORK ORDER TEMPLATE DIALOG ======= */}
              <Dialog open={useWoTplDialog} onOpenChange={setUseWoTplDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <div className="flex items-start justify-between gap-3 pr-6">
                      <div>
                        <DialogTitle>Use a Work Order Template</DialogTitle>
                        <DialogDescription>Pick a template — Scope, Stages, Additional, Deductions and Labour Rates will be loaded into the form. You still pick the contractor.</DialogDescription>
                      </div>
                      {(user?.role === 'planning' || user?.role === 'planning_person' || user?.role === 'super_admin' || user?.role === 'project_manager') && (
                        <Button
                          size="sm"
                          className="bg-violet-600 hover:bg-violet-700 h-8 gap-1 shrink-0"
                          onClick={openNewWoTemplate}
                          data-testid="wo-tpl-new"
                        >
                          <Plus className="h-3.5 w-3.5" /> New Template
                        </Button>
                      )}
                    </div>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    {woTemplates.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No saved templates yet. Click "+ New Template" above or use "Save as Template" on any existing Work Order.</p>
                    ) : (
                      woTemplates.map(tpl => (
                        <div key={tpl.template_id} className="border rounded-lg p-3 hover:border-violet-300 hover:bg-violet-50/40 transition" data-testid={`wo-tpl-row-${tpl.template_id}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm truncate">{tpl.name}</p>
                                {tpl.contractor_type && <Badge variant="outline" className="text-[10px]">{tpl.contractor_type}</Badge>}
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1">
                                Scope {tpl.scope_items?.length || 0} · Stages {tpl.stages?.length || 0} · Additional {tpl.additional_work?.length || 0}
                                {tpl.created_by_name && <span className="ml-2 text-gray-400">· by {tpl.created_by_name}</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 h-7 text-xs" onClick={() => applyWoTemplate(tpl)} data-testid={`wo-tpl-apply-${tpl.template_id}`}>Apply</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => handleDuplicateWoTemplate(tpl)} data-testid={`wo-tpl-duplicate-${tpl.template_id}`} title="Duplicate this template">
                                <Copy className="h-3 w-3 mr-1" /> Duplicate
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => openEditWoTemplate(tpl)} data-testid={`wo-tpl-edit-${tpl.template_id}`}>
                                <Edit className="h-3 w-3 mr-1" /> Edit
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDeleteWoTemplate(tpl)} data-testid={`wo-tpl-del-${tpl.template_id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
                                <TabsList className="w-full rounded-none border-b bg-white h-auto p-0 gap-0">
                                  <TabsTrigger value="scope" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5">Scope ({wo.scope_items?.length || 0})</TabsTrigger>
                                  <TabsTrigger value="stages" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5">Stages ({wo.stages?.length || 0})</TabsTrigger>
                                  <TabsTrigger value="additional" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5">Additional ({wo.additional_work?.length || 0})</TabsTrigger>
                                  <TabsTrigger value="dlr" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5" data-testid="labour-wo-dlr-tab">DLR</TabsTrigger>
                                  <TabsTrigger value="rab" className="flex-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 data-[state=active]:border-violet-600 data-[state=active]:font-semibold data-[state=active]:shadow-none py-2.5" data-testid="labour-wo-rab-tab">RAB</TabsTrigger>
                                </TabsList>
                                <TabsContent value="scope" className="p-3">
                                  {wo.scope_items?.length > 0 ? (
                                    <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead>
                                    <tbody className="divide-y">{(wo.scope_items || []).map((s, i) => (<tr key={i}><td className="px-3 py-2 text-xs text-gray-400">{i+1}</td><td className="px-3 py-2 font-medium">{s.name}</td><td className="px-3 py-2">{s.unit}</td><td className="px-3 py-2 text-right">{s.quantity}</td><td className="px-3 py-2 text-right">{formatCurrency(s.unit_rate)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(s.total)}</td></tr>))}</tbody>
                                    <tfoot className="border-t"><tr><td colSpan="5" className="px-3 py-2 text-right font-bold text-xs">Scope Total:</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(wo.scope_total)}</td></tr></tfoot></table>
                                  ) : <p className="text-gray-400 text-center py-4 text-sm">No scope items</p>}
                                </TabsContent>
                                <TabsContent value="stages" className="p-3">
                                  {wo.stages?.length > 0 ? (() => {
                                    const counts = { open: 0, locked: 0, completed: 0, all: wo.stages.length };
                                    wo.stages.forEach(s => { counts[stageBucketOf(s)]++; });
                                    const filteredStages = stagesBucket === 'all'
                                      ? wo.stages.map((st, i) => ({ st, i }))
                                      : wo.stages.map((st, i) => ({ st, i })).filter(({ st }) => stageBucketOf(st) === stagesBucket);
                                    return (
                                    <div className="space-y-2">
                                      {/* Sub-tab segmentation: Open | Locked | Completed | All */}
                                      <div className="flex items-center gap-2 mb-3 pb-1 overflow-x-auto" data-testid="labour-wo-stages-subtabs">
                                        {[
                                          { id: 'open',      label: 'Open',      cnt: counts.open,      base: 'border-emerald-300 bg-emerald-50 text-emerald-800', active: 'border-emerald-600 bg-emerald-100 ring-2 ring-emerald-300 text-emerald-900' },
                                          { id: 'locked',    label: 'Locked',    cnt: counts.locked,    base: 'border-gray-300 bg-gray-50 text-gray-700',          active: 'border-gray-500 bg-gray-200 ring-2 ring-gray-300 text-gray-900' },
                                          { id: 'completed', label: 'Completed', cnt: counts.completed, base: 'border-teal-300 bg-teal-50 text-teal-800',          active: 'border-teal-600 bg-teal-100 ring-2 ring-teal-300 text-teal-900' },
                                          { id: 'all',       label: 'All',       cnt: counts.all,       base: 'border-violet-300 bg-violet-50 text-violet-800',    active: 'border-violet-600 bg-violet-100 ring-2 ring-violet-300 text-violet-900' },
                                        ].map(t => {
                                          const isActive = stagesBucket === t.id;
                                          return (
                                            <button
                                              key={t.id}
                                              type="button"
                                              onClick={() => setStagesBucket(t.id)}
                                              className={`px-3 py-1.5 text-xs font-semibold rounded-md border-2 transition whitespace-nowrap shadow-sm ${isActive ? t.active : t.base + ' hover:brightness-95'}`}
                                              data-testid={`labour-wo-stages-subtab-${t.id}`}
                                            >
                                              {t.label}
                                              <span className={`ml-1.5 text-[10px] font-bold ${isActive ? '' : 'opacity-70'}`}>({t.cnt})</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {filteredStages.length === 0 ? (
                                        <p className="text-gray-400 text-center py-6 text-sm" data-testid="labour-wo-stages-empty">No stages in this bucket.</p>
                                      ) : filteredStages.map(({ st, i }) => {
                                        const released = (st.payment_requests || []).filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
                                        const inApproval = (st.payment_requests || []).filter(p => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(p.status)).reduce((s, p) => s + (p.requested_amount || 0), 0);
                                        const balance = Math.max(0, (Number(st.amount) || 0) - released);
                                        const stWithFlag = { ...st, _fullyPaid: (Number(st.amount) || 0) > 0 && released >= (Number(st.amount) || 0) };
                                        const cfg = getStageStatusConfig(st.status, st.is_open, stWithFlag);
                                        const showApprove = canApproveStage(st);
                                        const isExp = expandedWoStages[`l_${st.stage_id}`];
                                        const isStageOpen = st.is_open === true;
                                        const isCompleted = stWithFlag._fullyPaid;
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
                                                <div className="text-xs text-gray-500">Amount: <strong>{formatCurrency(st.amount)}</strong></div>
                                                {/* Summary chips — always shown for every stage */}
                                                <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid={`labour-advance-summary-${st.stage_id}`}>
                                                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">Contract <strong>{formatCurrency(st.amount)}</strong></span>
                                                  {released > 0 && <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Advance Approved <strong>{formatCurrency(released)}</strong></span>}
                                                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Balance <strong>{formatCurrency(balance)}</strong></span>
                                                  {inApproval > 0 && (
                                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">In Approval <strong>{formatCurrency(inApproval)}</strong></span>
                                                  )}
                                                  {st.auto_closed_by_advance && (
                                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">Auto-Closed</span>
                                                  )}
                                                </div>
                                                {/* Planning / Super-Admin: Open/Lock toggle on every stage (except already-completed) */}
                                                {['planning', 'planning_person', 'super_admin'].includes(user?.role) && !isCompleted && (
                                                  <div className="flex gap-1 flex-wrap pt-1">
                                                    {isStageOpen ? (
                                                      <Button size="sm" variant="outline" className="h-7 text-xs border-gray-400 text-gray-700 hover:bg-gray-100" data-testid={`labour-wo-stage-lock-${st.stage_id}`}
                                                        onClick={(e) => { e.stopPropagation(); handleLockStage(wo.work_order_id, st.stage_id); }}>
                                                        <Lock className="h-3 w-3 mr-1" /> Lock Stage
                                                      </Button>
                                                    ) : (
                                                      <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" data-testid={`labour-wo-stage-open-${st.stage_id}`}
                                                        onClick={(e) => { e.stopPropagation(); handleOpenStage(wo.work_order_id, st.stage_id); }}>
                                                        <Unlock className="h-3 w-3 mr-1" /> Open Stage
                                                      </Button>
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
                                                  {st.is_open && st.stage_status !== 'finished' && ['site_engineer', 'sr_site_engineer'].includes(user?.role) && (
                                                    <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" data-testid={`labour-wo-stage-request-${st.stage_id}`}
                                                      onClick={(e) => { e.stopPropagation(); handleWoStageRequest(wo.work_order_id, st.stage_id); }}>
                                                      <Send className="h-3 w-3 mr-1" /> Req Payment (RAB)
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
                                    );
                                  })() : <p className="text-gray-400 text-center py-4 text-sm">No stages</p>}
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
                                <TabsContent value="rab" className="p-3" data-testid="labour-wo-rab-content">
                                  <WORABTab
                                    projectId={projectId}
                                    workOrder={wo}
                                    onOpenRabView={(requestId) => setRabView({ open: true, projectId, workOrderId: wo.work_order_id, requestId })}
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
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-violet-600 hover:text-violet-800 hover:bg-violet-50"
                                  onClick={() => setRabView({ open: true, projectId, workOrderId: wo.work_order_id, requestId: null })}
                                  title="View RAB chain"
                                  data-testid={`labour-wo-view-rab-${wo.work_order_id}`}
                                ><Eye className="h-3.5 w-3.5" /></Button>
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

            {/* ==================== PRE-CONSTRUCTION STAGES (CRE + Planning Head + Planning Person + GM) ==================== */}
            <TabsContent value="construction-stage" className="p-3 sm:p-6">
              <div className="space-y-4" data-testid="construction-stage-tab-content">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-rose-600" />
                      Pre-Construction Stages
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {(['cre','super_admin','planning','planning_person','general_manager'].includes(user?.role))
                        ? 'Update status and scheduled date for each pre-construction milestone.'
                        : 'Captured by the CRE team. Status updates live from the CRE → Pre-Construction board.'}
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
                      // Inline editing surfaced to CRE (owner), Planning Head, Planning Person, GM and Super Admin.
                      const canEditPC = ['cre','super_admin','planning','planning_person','general_manager'].includes(user?.role);
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
                            {canEditPC && (
                              <div className="mt-3 pt-3 border-t border-dashed grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-[9px] uppercase tracking-wide text-gray-500">Status</Label>
                                  <Select
                                    value={s.status || 'pending'}
                                    onValueChange={async (v) => {
                                      try {
                                        await axios.patch(`${API}/cre/pre-construction/${projectId}/${s.key}`, { status: v });
                                        toast.success(`${s.label}: ${v}`);
                                        loadProjectData();
                                      } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update'); }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-[11px]" data-testid={`pc-status-${s.key}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                                      <SelectItem value="scheduled" className="text-xs">Scheduled</SelectItem>
                                      <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-[9px] uppercase tracking-wide text-gray-500">Scheduled Date</Label>
                                  <Input
                                    type="date"
                                    className="h-7 text-[11px]"
                                    defaultValue={s.scheduled_at ? new Date(s.scheduled_at).toISOString().split('T')[0] : ''}
                                    onBlur={async (e) => {
                                      const v = e.target.value;
                                      // No-op if value unchanged
                                      const current = s.scheduled_at ? new Date(s.scheduled_at).toISOString().split('T')[0] : '';
                                      if (v === current) return;
                                      try {
                                        if (!v) {
                                          await axios.patch(`${API}/cre/pre-construction/${projectId}/${s.key}`, { clear_schedule: true });
                                          toast.success(`${s.label}: schedule cleared`);
                                        } else {
                                          await axios.patch(`${API}/cre/pre-construction/${projectId}/${s.key}`, { scheduled_at: new Date(v).toISOString() });
                                          toast.success(`${s.label}: scheduled for ${v}`);
                                        }
                                        loadProjectData();
                                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
                                    }}
                                    data-testid={`pc-date-${s.key}`}
                                  />
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
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

      {/* RAB (Running Account Bill) Dialog — SE submits stage-payment request for labour WO */}
      <Dialog
        open={rabDialog.open}
        onOpenChange={(o) => !o && !rabDialog.submitting && setRabDialog({ open: false, workOrderId: null, stageId: null, amount: '', notes: '', submitting: false })}
      >
        <DialogContent className="max-w-md" data-testid="rab-request-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-amber-600" /> Request Payment (RAB)
            </DialogTitle>
            <DialogDescription>
              Submit a Running Account Bill for this stage. It will be reviewed by PM → QC → Planning → Accountant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Amount (₹) *</label>
              <Input
                type="number"
                min="1"
                value={rabDialog.amount}
                onChange={(e) => setRabDialog((d) => ({ ...d, amount: e.target.value }))}
                placeholder="e.g. 25000"
                disabled={rabDialog.submitting}
                data-testid="rab-amount-input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Notes (optional)</label>
              <Textarea
                rows={3}
                value={rabDialog.notes}
                onChange={(e) => setRabDialog((d) => ({ ...d, notes: e.target.value }))}
                placeholder="DLR summary, work completed, etc."
                disabled={rabDialog.submitting}
                data-testid="rab-notes-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRabDialog({ open: false, workOrderId: null, stageId: null, amount: '', notes: '', submitting: false })} disabled={rabDialog.submitting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={submitRabDialog} disabled={rabDialog.submitting} data-testid="rab-submit">
              <Send className="h-4 w-4 mr-1" /> {rabDialog.submitting ? 'Submitting…' : 'Submit RAB'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Req Payment Dialog — asks for expected payment month/date before submitting */}
      <Dialog
        open={reqPayDialog.open}
        onOpenChange={(o) => !o && !reqPayDialog.submitting && setReqPayDialog({ open: false, stage: null, date: '', submitting: false, mode: null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-amber-600" />Request {reqPayDialog.mode === 'addition_section' ? 'Section Payment' : reqPayDialog.mode === 'addition' ? 'Additional Payment' : 'Payment'}</DialogTitle>
            <DialogDescription>
              {reqPayDialog.mode === 'addition_section'
                ? `Send all ${reqPayDialog.items?.length || 0} client-approved rows under "${reqPayDialog.sectionName}" to CRE as a single Payment Schedule entry. Pick the month it should be collected.`
                : reqPayDialog.mode === 'addition'
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
                  } else if (reqPayDialog.mode === 'addition_section') {
                    // Section-level Req Payment: loop over each client-approved
                    // row in the section and request payment for it. They will
                    // appear on the CRE Payment Schedule grouped under the
                    // section name (via section_id stamped on each
                    // payment_stage by the backend). Toast surfaces the total.
                    for (const it of (reqPayDialog.items || [])) {
                      await handleRequestAdditionPayment(it.cost_id, reqPayDialog.date);
                    }
                    toast.success(`Section "${reqPayDialog.sectionName}" — sent ${reqPayDialog.items?.length || 0} items to CRE`);
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

      {/* Mark Critical Dialog — enables a red Critical badge on the project + a red dot on All Projects */}
      <Dialog
        open={critDialog.open}
        onOpenChange={(o) => !o && !critDialog.submitting && setCritDialog({ open: false, is_critical: false, notes: '', submitting: false })}
      >
        <DialogContent className="max-w-md" data-testid="mark-critical-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="block h-2.5 w-2.5 rounded-full bg-red-500" />
              {project?.is_critical ? 'Update Critical Status' : 'Mark Project as Critical'}
            </DialogTitle>
            <DialogDescription>
              {project?.is_critical
                ? 'Update the reason or unmark this project to remove its critical badge.'
                : 'Add a short reason. Once saved, a red dot appears next to this project on the All Projects board.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border p-2.5 bg-red-50/40">
              <span className="text-xs font-medium text-gray-700 flex-1">Mark as Critical</span>
              <button
                type="button"
                role="switch"
                aria-checked={critDialog.is_critical}
                onClick={() => setCritDialog(d => ({ ...d, is_critical: !d.is_critical }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${critDialog.is_critical ? 'bg-red-500' : 'bg-gray-300'}`}
                data-testid="crit-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${critDialog.is_critical ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div>
              <Label className="text-xs">Reason / Notes {critDialog.is_critical && <span className="text-red-500">*</span>}</Label>
              <Textarea
                value={critDialog.notes}
                onChange={(e) => setCritDialog(d => ({ ...d, notes: e.target.value }))}
                rows={3}
                placeholder="e.g. Client payment overdue, design escalated to GM, site stop-work…"
                className="mt-1 text-sm"
                data-testid="crit-notes-input"
                disabled={!critDialog.is_critical}
              />
            </div>
            {project?.is_critical && project.critical_marked_by_name && (
              <p className="text-[11px] text-gray-400">
                Last marked by {project.critical_marked_by_name}
                {project.critical_marked_at ? ` • ${new Date(project.critical_marked_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCritDialog({ open: false, is_critical: false, notes: '', submitting: false })} disabled={critDialog.submitting}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              data-testid="crit-save-btn"
              disabled={critDialog.submitting || (critDialog.is_critical && !critDialog.notes.trim())}
              onClick={async () => {
                setCritDialog(d => ({ ...d, submitting: true }));
                try {
                  const res = await axios.patch(`${API}/projects/${projectId}/critical`, {
                    is_critical: critDialog.is_critical,
                    critical_notes: critDialog.is_critical ? critDialog.notes.trim() : '',
                  });
                  toast.success(res.data.is_critical ? 'Marked as critical' : 'Critical flag removed');
                  setCritDialog({ open: false, is_critical: false, notes: '', submitting: false });
                  fetchData(false);
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to update');
                  setCritDialog(d => ({ ...d, submitting: false }));
                }
              }}
            >
              {critDialog.submitting ? 'Saving…' : (critDialog.is_critical ? 'Save' : 'Unmark Critical')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WO Notes — Add Template Dialog (replaces window.prompt for clean Shadcn UX) */}      <Dialog
        open={addTplDialog.open}
        onOpenChange={(o) => !o && !addTplDialog.submitting && setAddTplDialog({ open: false, text: '', submitting: false })}
      >
        <DialogContent className="max-w-md" data-testid="wo-tpl-add-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" /> Add Notes Template
            </DialogTitle>
            <DialogDescription>
              Save a reusable note like &ldquo;Material at contractor cost&rdquo; so anyone can pick it next time.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Template text</Label>
            <Textarea
              value={addTplDialog.text}
              onChange={(e) => setAddTplDialog(d => ({ ...d, text: e.target.value }))}
              rows={4}
              placeholder="e.g. Material at contractor cost; advance subject to PM approval."
              className="mt-1 text-sm"
              data-testid="wo-tpl-add-textarea"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTplDialog({ open: false, text: '', submitting: false })} disabled={addTplDialog.submitting}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="wo-tpl-add-confirm"
              disabled={addTplDialog.submitting || !addTplDialog.text.trim()}
              onClick={async () => {
                setAddTplDialog(d => ({ ...d, submitting: true }));
                try {
                  const res = await axios.post(`${API}/wo-note-templates`, { text: addTplDialog.text.trim() });
                  setWoNoteTemplates(prev => [res.data, ...prev]);
                  toast.success('Template saved');
                  setAddTplDialog({ open: false, text: '', submitting: false });
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to save template');
                  setAddTplDialog(d => ({ ...d, submitting: false }));
                }
              }}
            >
              {addTplDialog.submitting ? 'Saving…' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WO Notes — Delete Template Confirmation Dialog */}
      <Dialog
        open={delTplDialog.open}
        onOpenChange={(o) => !o && !delTplDialog.submitting && setDelTplDialog({ open: false, template: null, submitting: false })}
      >
        <DialogContent className="max-w-sm" data-testid="wo-tpl-del-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" /> Delete Template?
            </DialogTitle>
            <DialogDescription>
              This template will be removed for everyone in your team.
            </DialogDescription>
          </DialogHeader>
          {delTplDialog.template && (
            <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-800">
              {delTplDialog.template.label || delTplDialog.template.text}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTplDialog({ open: false, template: null, submitting: false })} disabled={delTplDialog.submitting}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              data-testid="wo-tpl-del-confirm"
              disabled={delTplDialog.submitting}
              onClick={async () => {
                const t = delTplDialog.template;
                if (!t) return;
                setDelTplDialog(d => ({ ...d, submitting: true }));
                try {
                  await axios.delete(`${API}/wo-note-templates/${t.template_id}`);
                  setWoNoteTemplates(prev => prev.filter(x => x.template_id !== t.template_id));
                  toast.success('Template removed');
                  setDelTplDialog({ open: false, template: null, submitting: false });
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to remove');
                  setDelTplDialog(d => ({ ...d, submitting: false }));
                }
              }}
            >
              {delTplDialog.submitting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super-Admin: Payment Stage Lifecycle Detail Dialog */}
      <Dialog
        open={stageDetailDialog.open}
        onOpenChange={(o) => !o && setStageDetailDialog({ open: false, stage: null, data: null, loading: false, tab: 'summary' })}
      >
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="stage-detail-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Eye className="h-5 w-5" /> Payment Stage Details
            </DialogTitle>
            {stageDetailDialog.data?.summary?.stage_name && (
              <DialogDescription className="text-xs">
                {stageDetailDialog.data.summary.stage_label || ''} <span className="font-medium text-gray-700">{stageDetailDialog.data.summary.stage_name}</span>
                {stageDetailDialog.data?.project?.name && (
                  <> · <span className="text-violet-700">{stageDetailDialog.data.project.name}</span></>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          {stageDetailDialog.loading || !stageDetailDialog.data ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
                {[
                  { k: 'summary',  label: 'Summary' },
                  { k: 'advance',  label: 'Advance', hidden: !stageDetailDialog.data.advance },
                  { k: 'incomes',  label: `Incomes (${(stageDetailDialog.data.incomes || []).length})` },
                  { k: 'cheques',  label: `Cheques (${(stageDetailDialog.data.cheques || []).length})` },
                  { k: 'timeline', label: `Timeline (${(stageDetailDialog.data.timeline || []).length})` },
                ].filter(t => !t.hidden).map(t => (
                  <button
                    key={t.k}
                    onClick={() => setStageDetailDialog((d) => ({ ...d, tab: t.k }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${stageDetailDialog.tab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    data-testid={`stage-detail-tab-${t.k}`}
                  >{t.label}</button>
                ))}
              </div>

              {/* SUMMARY */}
              {stageDetailDialog.tab === 'summary' && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {Object.entries({
                    'Stage Name': stageDetailDialog.data.summary.stage_name,
                    'Stage Label': stageDetailDialog.data.summary.stage_label,
                    'Percentage': stageDetailDialog.data.summary.percentage != null ? `${stageDetailDialog.data.summary.percentage}%` : '—',
                    'Amount': `₹${Number(stageDetailDialog.data.summary.amount || 0).toLocaleString('en-IN')}`,
                    'Received': `₹${Number(stageDetailDialog.data.summary.amount_received || 0).toLocaleString('en-IN')}`,
                    'Balance': `₹${Number(stageDetailDialog.data.summary.balance || 0).toLocaleString('en-IN')}`,
                    'Status': stageDetailDialog.data.summary.status,
                    'Workflow': stageDetailDialog.data.summary.workflow_status || '—',
                    'Expected Date': stageDetailDialog.data.summary.expected_payment_date ? new Date(stageDetailDialog.data.summary.expected_payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
                    'Payment Mode': (stageDetailDialog.data.summary.payment_mode || '—').toString().replace(/_/g, ' '),
                    'Collected By': stageDetailDialog.data.summary.collected_by_name || '—',
                    'Collected At': stageDetailDialog.data.summary.collected_at ? new Date(stageDetailDialog.data.summary.collected_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                    'Fully Paid At': stageDetailDialog.data.summary.paid_at ? new Date(stageDetailDialog.data.summary.paid_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                  }).map(([k, v]) => (
                    <div key={k} className="rounded-md border bg-gray-50 px-3 py-2">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k}</p>
                      <p className="text-xs font-medium text-gray-800 truncate" title={String(v)}>{v || '—'}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ADVANCE */}
              {stageDetailDialog.tab === 'advance' && stageDetailDialog.data.advance && (
                <div className="rounded-lg border bg-emerald-50/40 p-4 text-xs space-y-2">
                  <p className="font-semibold text-emerald-800">Advance / Client Pre-payment</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-gray-500">Amount</span><p className="font-semibold text-emerald-700">₹{Number(stageDetailDialog.data.advance.amount || 0).toLocaleString('en-IN')}</p></div>
                    <div><span className="text-gray-500">Payment Mode</span><p className="font-medium">{(stageDetailDialog.data.advance.payment_mode || '—').toString().replace(/_/g, ' ')}</p></div>
                    <div><span className="text-gray-500">Payment Date</span><p className="font-medium">{stageDetailDialog.data.advance.payment_date ? new Date(stageDetailDialog.data.advance.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                    <div><span className="text-gray-500">Collected By</span><p className="font-medium">{stageDetailDialog.data.advance.collected_by_name || '—'}</p></div>
                  </div>
                </div>
              )}

              {/* INCOMES */}
              {stageDetailDialog.tab === 'incomes' && (
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500">Date</th>
                        <th className="text-right px-3 py-2 text-gray-500">Amount</th>
                        <th className="text-left px-3 py-2 text-gray-500">Mode</th>
                        <th className="text-left px-3 py-2 text-gray-500">Reference</th>
                        <th className="text-left px-3 py-2 text-gray-500">Status</th>
                        <th className="text-left px-3 py-2 text-gray-500">Collected By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stageDetailDialog.data.incomes || []).length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No income records yet</td></tr>
                      ) : (
                        stageDetailDialog.data.incomes.map((inc) => (
                          <tr key={inc.income_id} className="border-t">
                            <td className="px-3 py-2">{inc.payment_date ? new Date(inc.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold">₹{Number(inc.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2">{(inc.payment_mode || '—').toString().replace(/_/g, ' ')}</td>
                            <td className="px-3 py-2 text-gray-600">{inc.payment_reference || '—'}</td>
                            <td className="px-3 py-2"><Badge className={`text-[10px] ${inc.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : inc.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{inc.status || '—'}</Badge></td>
                            <td className="px-3 py-2">{inc.collected_by_name || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* CHEQUES */}
              {stageDetailDialog.tab === 'cheques' && (
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500">Cheque #</th>
                        <th className="text-left px-3 py-2 text-gray-500">Bank</th>
                        <th className="text-right px-3 py-2 text-gray-500">Amount</th>
                        <th className="text-left px-3 py-2 text-gray-500">Cheque Date</th>
                        <th className="text-left px-3 py-2 text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stageDetailDialog.data.cheques || []).length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No cheque records</td></tr>
                      ) : (
                        stageDetailDialog.data.cheques.map((c) => (
                          <tr key={c.cheque_id} className="border-t">
                            <td className="px-3 py-2 font-mono font-semibold">{c.cheque_number || '—'}</td>
                            <td className="px-3 py-2">{c.bank_name || '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold">₹{Number(c.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2">{c.cheque_date ? new Date(c.cheque_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="px-3 py-2">
                              <Badge className={`text-[10px] ${c.status === 'bounced' ? 'bg-red-100 text-red-700' : c.status === 'cleared' || c.is_opened ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {c.status || '—'}{c.is_opened ? ' · opened' : ''}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TIMELINE */}
              {stageDetailDialog.tab === 'timeline' && (
                <div className="relative pl-5">
                  <div className="absolute top-0 bottom-0 left-2 w-px bg-gray-200"></div>
                  {(stageDetailDialog.data.timeline || []).length === 0 ? (
                    <p className="text-xs text-gray-400 py-6 text-center">No timeline events recorded</p>
                  ) : (
                    stageDetailDialog.data.timeline.map((e, idx) => {
                      const dotCls = {
                        created: 'bg-gray-400',
                        requested: 'bg-blue-500',
                        cre_rejected: 'bg-red-500',
                        accountant_rejected: 'bg-red-500',
                        collected: 'bg-amber-500',
                        paid: 'bg-emerald-500',
                        income_approved: 'bg-emerald-500',
                        income_rejected: 'bg-red-500',
                        cheque_received: 'bg-indigo-500',
                        cheque_opened: 'bg-emerald-500',
                        cheque_bounced: 'bg-red-600',
                      }[e.kind] || 'bg-gray-400';
                      return (
                        <div key={idx} className="relative py-2 pl-4">
                          <span className={`absolute -left-0.5 top-3 h-3 w-3 rounded-full ring-2 ring-white ${dotCls}`}></span>
                          <p className="text-xs font-medium text-gray-800">{e.label}</p>
                          <p className="text-[10px] text-gray-500">
                            {e.at ? new Date(e.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            {e.by_name ? <> · by <span className="font-medium text-gray-700">{e.by_name}</span></> : null}
                          </p>
                          {e.meta?.reason && <p className="text-[10px] text-red-600 italic mt-0.5">Reason: {e.meta.reason}</p>}
                          {e.meta?.payment_mode && <p className="text-[10px] text-gray-600 mt-0.5">Mode: {String(e.meta.payment_mode).replace(/_/g, ' ')}</p>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDetailDialog({ open: false, stage: null, data: null, loading: false, tab: 'summary' })}>Close</Button>
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

      {/* RAB chain detail popup — surfaced from every Work Order row. */}
      <RABDetailDialog
        open={rabView.open}
        onOpenChange={(o) => setRabView(v => ({ ...v, open: o }))}
        projectId={rabView.projectId}
        workOrderId={rabView.workOrderId}
        highlightRequestId={rabView.requestId}
      />
    </div>
  );
}
