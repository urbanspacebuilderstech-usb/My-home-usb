import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw, Save, Trash2, Wallet, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, BarChart3, Settings as SettingsIcon, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function CashflowEngine() {
  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState({ global: { direct_pct: 85, indirect_pct: 15 }, overrides: [] });
  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('summary');
  const [user, setUser] = useState(null);
  const [overrideDialog, setOverrideDialog] = useState({ open: false, project: null, direct_pct: 85, indirect_pct: 15, apply_retroactively: false });
  const [globalEdit, setGlobalEdit] = useState({ direct_pct: 85, indirect_pct: 15 });
  const [projectsList, setProjectsList] = useState([]);
  // Lock state: global split is locked once saved; admin must enter password to re-edit.
  const [globalLocked, setGlobalLocked] = useState(true);
  const [pwDialog, setPwDialog] = useState({ open: false, password: '', verifying: false });
  // Feb 22 2026 — Per-Project Cashflow search filter (case-insensitive,
  // matches project name).
  const [ppSearch, setPpSearch] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, c, inc, exp, projs] = await Promise.all([
        axios.get(`${API}/cashflow/summary`),
        axios.get(`${API}/cashflow/config`),
        axios.get(`${API}/cashflow/ledger?kind=income`),
        axios.get(`${API}/cashflow/ledger?kind=expense`),
        axios.get(`${API}/projects?limit=500`).catch(() => ({ data: [] })),
      ]);
      setSummary(s.data);
      setConfig(c.data);
      setIncomeRows(inc.data || []);
      setExpenseRows(exp.data || []);
      setGlobalEdit({ direct_pct: c.data.global.direct_pct, indirect_pct: c.data.global.indirect_pct });
      const projs_data = Array.isArray(projs.data) ? projs.data : (projs.data?.projects || []);
      setProjectsList(projs_data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load cashflow');
    }
    setLoading(false);
  };

  useEffect(() => {
    axios.get(`${API}/auth/me`).then(r => setUser(r.data)).catch(() => {});
    fetchAll();
  }, []);

  const isAdmin = user?.role === 'super_admin';

  const saveGlobal = async () => {
    if (Math.abs(Number(globalEdit.direct_pct) + Number(globalEdit.indirect_pct) - 100) > 0.01) {
      toast.error('Direct + Indirect must sum to 100');
      return;
    }
    setBusy(true);
    try {
      await axios.patch(`${API}/cashflow/config`, {
        direct_pct: Number(globalEdit.direct_pct),
        indirect_pct: Number(globalEdit.indirect_pct),
      });
      toast.success('Global split updated');
      setGlobalLocked(true);
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const submitOverride = async () => {
    const { project, direct_pct, indirect_pct, apply_retroactively } = overrideDialog;
    if (!project) return;
    if (Math.abs(Number(direct_pct) + Number(indirect_pct) - 100) > 0.01) {
      toast.error('Direct + Indirect must sum to 100');
      return;
    }
    setBusy(true);
    try {
      const r = await axios.put(`${API}/cashflow/config/projects/${project.project_id}`, {
        direct_pct: Number(direct_pct),
        indirect_pct: Number(indirect_pct),
        apply_retroactively: !!apply_retroactively,
      });
      toast.success(`Override saved${r.data.retroactive_rows_updated ? ` · ${r.data.retroactive_rows_updated} past rows updated` : ''}`);
      setOverrideDialog({ open: false, project: null, direct_pct: 85, indirect_pct: 15, apply_retroactively: false });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const deleteOverride = async (pid) => {
    if (!window.confirm('Remove this project override and revert to global split?')) return;
    setBusy(true);
    try {
      await axios.delete(`${API}/cashflow/config/projects/${pid}`);
      toast.success('Override removed');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const fullRecompute = async () => {
    if (!window.confirm('Rebuild the entire Cashflow ledger from scratch using current splits?\nThis will replay all approved income + recorded expenses.')) return;
    setBusy(true);
    try {
      const r = await axios.post(`${API}/cashflow/recompute`);
      toast.success(`Recompute complete · ${r.data.income_rows} income · ${r.data.expense_rows} expense`);
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const submitPasswordUnlock = async () => {
    if (!pwDialog.password) { toast.error('Enter your password'); return; }
    setPwDialog(d => ({ ...d, verifying: true }));
    try {
      await axios.post(`${API}/auth/verify-password`, { password: pwDialog.password });
      setGlobalLocked(false);
      setPwDialog({ open: false, password: '', verifying: false });
      toast.success('Unlocked — you can now edit the global split');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Incorrect password');
      setPwDialog(d => ({ ...d, verifying: false }));
    }
  };

  const overrideMap = useMemo(() => {
    const m = {};
    (config.overrides || []).forEach(o => { m[o.project_id] = o; });
    return m;
  }, [config.overrides]);

  const availableForOverride = useMemo(() => {
    return (projectsList || []).filter(p => !overrideMap[p.project_id]);
  }, [projectsList, overrideMap]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/accounts-board" data-testid="cf-back-link">
              <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Wallet className="h-6 w-6 text-indigo-600" /> Cashflow Engine</h1>
              <p className="text-xs text-gray-500">Splits every approved income into Direct & Indirect pools; expenses drain the matching pool.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={busy} data-testid="cf-refresh-btn"><RefreshCw className={`h-4 w-4 mr-1 ${busy ? 'animate-spin' : ''}`} /> Refresh</Button>
            {isAdmin && (
              <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-700" onClick={fullRecompute} disabled={busy} data-testid="cf-recompute-btn">
                Recompute From Source
              </Button>
            )}
          </div>
        </div>

        {/* Summary Strip — 3 cards × 3 metrics each */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="cf-summary-strip">
            {/* Card 01 — TOTAL INCOME */}
            <Card className="bg-gradient-to-br from-violet-50 to-violet-100/40 border-violet-200">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase text-violet-700">Cashflow Overview</span>
                  {summary.net >= 0 ? <TrendingUp className="h-4 w-4 text-violet-600" /> : <TrendingDown className="h-4 w-4 text-rose-600" />}
                </div>
                <div className="flex items-center justify-between border-b border-violet-200/60 pb-1.5">
                  <span className="text-[11px] text-violet-700/80">Total Income</span>
                  <span className="text-sm font-bold text-emerald-700" data-testid="cf-card1-income">{fmt(summary.income_total)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-violet-200/60 pb-1.5">
                  <span className="text-[11px] text-violet-700/80">Total Expense <span className="opacity-60">(D+I)</span></span>
                  <span className="text-sm font-bold text-rose-600" data-testid="cf-card1-expense">{fmt(summary.expense_total)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[12px] font-semibold text-violet-900">Balance</span>
                  <span className={`text-lg font-extrabold ${summary.net >= 0 ? 'text-violet-800' : 'text-rose-800'}`} data-testid="cf-card1-balance">{fmt(summary.net)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Card 02 — TOTAL DIRECT */}
            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-emerald-200">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase text-emerald-700">Direct Cost Allocation</span>
                  <Badge className="bg-emerald-200 text-emerald-800 text-[10px]">{summary.effective_split?.direct_pct}%</Badge>
                </div>
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                  <span className="text-[11px] text-emerald-700/80">Total Direct Allocation</span>
                  <span className="text-sm font-bold text-emerald-700" data-testid="cf-card2-allocation">{fmt(summary.direct_in)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                  <span className="text-[11px] text-emerald-700/80">Expense (Direct)</span>
                  <span className="text-sm font-bold text-rose-600" data-testid="cf-card2-expense">{fmt(summary.direct_out)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[12px] font-semibold text-emerald-900">Balance</span>
                  <span className="text-lg font-extrabold text-emerald-800" data-testid="cf-card2-balance">{fmt(summary.direct_balance)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Card 03 — TOTAL INDIRECT */}
            <Card className="bg-gradient-to-br from-sky-50 to-sky-100/40 border-sky-200">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase text-sky-700">Indirect Cost Allocation</span>
                  <Badge className="bg-sky-200 text-sky-800 text-[10px]">{summary.effective_split?.indirect_pct}%</Badge>
                </div>
                <div className="flex items-center justify-between border-b border-sky-200/60 pb-1.5">
                  <span className="text-[11px] text-sky-700/80">Total Indirect Allocation</span>
                  <span className="text-sm font-bold text-sky-700" data-testid="cf-card3-allocation">{fmt(summary.indirect_in)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-sky-200/60 pb-1.5">
                  <span className="text-[11px] text-sky-700/80">Expense (Indirect)</span>
                  <span className="text-sm font-bold text-rose-600" data-testid="cf-card3-expense">{fmt(summary.indirect_out)}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[12px] font-semibold text-sky-900">Balance</span>
                  <span className="text-lg font-extrabold text-sky-800" data-testid="cf-card3-balance">{fmt(summary.indirect_balance)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border" data-testid="cf-tabs">
            <TabsTrigger value="summary" data-testid="cf-tab-summary"><BarChart3 className="h-4 w-4 mr-1" /> Summary</TabsTrigger>
            <TabsTrigger value="income" data-testid="cf-tab-income"><ArrowDownLeft className="h-4 w-4 mr-1" /> Income ({incomeRows.length})</TabsTrigger>
            <TabsTrigger value="expense" data-testid="cf-tab-expense"><ArrowUpRight className="h-4 w-4 mr-1" /> Expense ({expenseRows.length})</TabsTrigger>
            <TabsTrigger value="settings" data-testid="cf-tab-settings"><SettingsIcon className="h-4 w-4 mr-1" /> Settings</TabsTrigger>
          </TabsList>

          {/* SUMMARY: Per-project breakdown */}
          <TabsContent value="summary">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">Per-Project Cashflow</CardTitle>
                <div className="relative w-64 max-w-full">
                  <Input
                    type="text"
                    placeholder="Search project…"
                    value={ppSearch}
                    onChange={(e) => setPpSearch(e.target.value)}
                    className="h-8 text-xs pl-3 pr-8"
                    data-testid="cf-summary-project-search"
                  />
                  {ppSearch && (
                    <button
                      type="button"
                      onClick={() => setPpSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none"
                      data-testid="cf-summary-project-search-clear"
                      aria-label="Clear search"
                    >×</button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-y text-[11px] uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-center w-12">S.No</th>
                        <th className="px-4 py-2 text-left">Project</th>
                        <th className="px-4 py-2 text-center">Split</th>
                        <th className="px-4 py-2 text-right">Direct In</th>
                        <th className="px-4 py-2 text-right">Direct Out</th>
                        <th className="px-4 py-2 text-right">Direct Bal</th>
                        <th className="px-4 py-2 text-right">Indirect In</th>
                        <th className="px-4 py-2 text-right">Indirect Out</th>
                        <th className="px-4 py-2 text-right">Indirect Bal</th>
                        <th className="px-4 py-2 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        const q = ppSearch.trim().toLowerCase();
                        const rows = (summary?.per_project || []).filter(p => !q || (p.project_name || '').toLowerCase().includes(q));
                        if (rows.length === 0) {
                          return (
                            <tr><td colSpan="10" className="p-6 text-center text-gray-400">
                              {q ? `No project matches "${ppSearch}"` : 'No allocations yet — approve income or run "Recompute From Source".'}
                            </td></tr>
                          );
                        }
                        return rows.map((p, idx) => (
                        <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`cf-summary-row-${p.project_id}`}>
                          <td className="px-4 py-2.5 text-center text-gray-500 tabular-nums">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <Link to={`/projects/${p.project_id}`} className="text-indigo-600 hover:underline font-medium">{p.project_name || '— Unassigned —'}</Link>
                          </td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{p.effective_split?.direct_pct ?? summary.effective_split?.direct_pct}%</Badge>
                              <span className="text-gray-400 text-[10px]">/</span>
                              <Badge className="bg-sky-100 text-sky-700 text-[10px]">{p.effective_split?.indirect_pct ?? summary.effective_split?.indirect_pct}%</Badge>
                              {p.has_override && <Badge variant="outline" className="text-[9px] border-indigo-300 text-indigo-700 ml-1">Override</Badge>}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-emerald-700">{fmt(p.direct_in)}</td>
                          <td className="px-4 py-2.5 text-right text-rose-600">{fmt(p.direct_out)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(p.direct_balance)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-700">{fmt(p.indirect_in)}</td>
                          <td className="px-4 py-2.5 text-right text-rose-600">{fmt(p.indirect_out)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(p.indirect_balance)}</td>
                          <td className={`px-4 py-2.5 text-right font-bold ${p.net >= 0 ? 'text-violet-700' : 'text-rose-700'}`}>{fmt(p.net)}</td>
                        </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* INCOME LEDGER */}
          <TabsContent value="income">
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between text-xs text-gray-600">
                  <span>Every approved income row is split using the snapshot below (or the project override at the time).</span>
                  <span className="flex items-center gap-1">Current global split: <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{summary?.effective_split?.direct_pct}%</Badge> <span>/</span> <Badge className="bg-sky-100 text-sky-700 text-[10px]">{summary?.effective_split?.indirect_pct}%</Badge></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-y text-[11px] uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Project</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-right">Direct</th>
                        <th className="px-4 py-2 text-right">Indirect</th>
                        <th className="px-4 py-2 text-center">Split</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {incomeRows.length === 0 ? (
                        <tr><td colSpan="6" className="p-6 text-center text-gray-400">No allocated income yet.</td></tr>
                      ) : incomeRows.map(r => (
                        <tr key={r.ledger_id} className="hover:bg-gray-50" data-testid={`cf-inc-row-${r.ledger_id}`}>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{(r.created_at || '').slice(0, 10)}</td>
                          <td className="px-4 py-2.5">{r.project_name || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(r.amount)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-700">{fmt(r.direct_amount)}</td>
                          <td className="px-4 py-2.5 text-right text-sky-700">{fmt(r.indirect_amount)}</td>
                          <td className="px-4 py-2.5 text-center">
                            {r.snapshot_split && (
                              <Badge variant="outline" className="text-[10px]">
                                {r.snapshot_split.direct_pct}% / {r.snapshot_split.indirect_pct}%
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EXPENSE LEDGER */}
          <TabsContent value="expense">
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between text-xs text-gray-600">
                  <span>Direct-pool categories (material, labour, vendor) drain Direct · Overhead categories drain Indirect.</span>
                  <span className="flex items-center gap-1">Current split: <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{summary?.effective_split?.direct_pct}%</Badge> <span>/</span> <Badge className="bg-sky-100 text-sky-700 text-[10px]">{summary?.effective_split?.indirect_pct}%</Badge></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-y text-[11px] uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Project</th>
                        <th className="px-4 py-2 text-left">Category</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-center">Pool</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {expenseRows.length === 0 ? (
                        <tr><td colSpan="5" className="p-6 text-center text-gray-400">No allocated expenses yet.</td></tr>
                      ) : expenseRows.map(r => (
                        <tr key={r.ledger_id} className="hover:bg-gray-50" data-testid={`cf-exp-row-${r.ledger_id}`}>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{(r.created_at || '').slice(0, 10)}</td>
                          <td className="px-4 py-2.5">{r.project_name || '—'}</td>
                          <td className="px-4 py-2.5 capitalize">{(r.category || '').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-rose-700">{fmt(r.amount)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge className={r.pool === 'direct' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}>
                              {r.pool}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Global Default Split</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Direct %</Label>
                      <Input type="number" min={0} max={100} step={0.5} value={globalEdit.direct_pct} onChange={(e) => setGlobalEdit(g => ({ ...g, direct_pct: e.target.value, indirect_pct: Math.max(0, 100 - Number(e.target.value)) }))} data-testid="cf-global-direct" disabled={!isAdmin || globalLocked} />
                    </div>
                    <div>
                      <Label className="text-xs">Indirect %</Label>
                      <Input type="number" min={0} max={100} step={0.5} value={globalEdit.indirect_pct} onChange={(e) => setGlobalEdit(g => ({ ...g, indirect_pct: e.target.value, direct_pct: Math.max(0, 100 - Number(e.target.value)) }))} data-testid="cf-global-indirect" disabled={!isAdmin || globalLocked} />
                    </div>
                  </div>
                  {!isAdmin ? (
                    <p className="text-[11px] text-gray-500 italic">Only Super Admin can modify the global split.</p>
                  ) : globalLocked ? (
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setPwDialog({ open: true, password: '', verifying: false })}
                        variant="outline"
                        className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                        data-testid="cf-global-edit"
                      >
                        <Lock className="h-4 w-4 mr-1" /> Edit (Password Required)
                      </Button>
                      <span className="text-[11px] text-gray-500">Locked — re-enter your password to modify.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button onClick={saveGlobal} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="cf-global-save"><Save className="h-4 w-4 mr-1" /> Save Global</Button>
                      <Button variant="outline" onClick={() => { setGlobalEdit({ direct_pct: config.global.direct_pct, indirect_pct: config.global.indirect_pct }); setGlobalLocked(true); }} data-testid="cf-global-cancel">Cancel</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    Per-Project Overrides
                    {isAdmin && availableForOverride.length > 0 && (
                      <select
                        className="text-xs border rounded px-2 py-1"
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const p = projectsList.find(pp => pp.project_id === e.target.value);
                          if (p) {
                            setOverrideDialog({ open: true, project: p, direct_pct: config.global.direct_pct, indirect_pct: config.global.indirect_pct, apply_retroactively: false });
                          }
                          e.target.value = '';
                        }}
                        data-testid="cf-add-override-select"
                      >
                        <option value="">+ Add override…</option>
                        {availableForOverride.map(p => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
                      </select>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto">
                    {(config.overrides || []).length === 0 ? (
                      <p className="p-6 text-center text-gray-400 text-sm">No project-level overrides yet. All projects use the global split.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-y text-[11px] uppercase text-gray-500">
                          <tr>
                            <th className="px-4 py-2 text-left">Project</th>
                            <th className="px-4 py-2 text-center">Direct</th>
                            <th className="px-4 py-2 text-center">Indirect</th>
                            <th className="px-4 py-2 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {config.overrides.map(o => (
                            <tr key={o.project_id} data-testid={`cf-override-row-${o.project_id}`}>
                              <td className="px-4 py-2.5">{o.project_name || o.project_id}</td>
                              <td className="px-4 py-2.5 text-center"><Badge className="bg-emerald-100 text-emerald-700">{o.direct_pct}%</Badge></td>
                              <td className="px-4 py-2.5 text-center"><Badge className="bg-sky-100 text-sky-700">{o.indirect_pct}%</Badge></td>
                              <td className="px-4 py-2.5 text-right space-x-1">
                                {isAdmin && (
                                  <>
                                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setOverrideDialog({ open: true, project: { project_id: o.project_id, name: o.project_name }, direct_pct: o.direct_pct, indirect_pct: o.indirect_pct, apply_retroactively: false })} data-testid={`cf-edit-override-${o.project_id}`}>Edit</Button>
                                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50" onClick={() => deleteOverride(o.project_id)} data-testid={`cf-del-override-${o.project_id}`}><Trash2 className="h-3 w-3" /></Button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Password unlock dialog — required before editing the Global Split */}
      <Dialog open={pwDialog.open} onOpenChange={(o) => !o && !pwDialog.verifying && setPwDialog({ open: false, password: '', verifying: false })}>
        <DialogContent className="max-w-sm" data-testid="cf-pw-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-indigo-600" /> Enter Password to Edit</DialogTitle>
            <DialogDescription>Editing the Global Cost Allocation is restricted. Please re-enter your password to unlock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs">Your password</Label>
            <Input
              type="password"
              autoFocus
              value={pwDialog.password}
              onChange={(e) => setPwDialog(d => ({ ...d, password: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPasswordUnlock(); }}
              placeholder="••••••••"
              data-testid="cf-pw-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog({ open: false, password: '', verifying: false })} disabled={pwDialog.verifying}>Cancel</Button>
            <Button onClick={submitPasswordUnlock} disabled={pwDialog.verifying || !pwDialog.password} className="bg-indigo-600 hover:bg-indigo-700" data-testid="cf-pw-submit">
              {pwDialog.verifying ? 'Verifying…' : 'Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideDialog.open} onOpenChange={(o) => !o && setOverrideDialog({ open: false, project: null, direct_pct: 85, indirect_pct: 15, apply_retroactively: false })}>
        <DialogContent className="max-w-md" data-testid="cf-override-dialog">
          <DialogHeader>
            <DialogTitle>Cost Allocation — {overrideDialog.project?.name}</DialogTitle>
            <DialogDescription>Adjust how income for this project is split between Direct & Indirect pools.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Direct %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={overrideDialog.direct_pct} onChange={(e) => setOverrideDialog(d => ({ ...d, direct_pct: e.target.value, indirect_pct: Math.max(0, 100 - Number(e.target.value)) }))} data-testid="cf-override-direct" />
              </div>
              <div>
                <Label className="text-xs">Indirect %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={overrideDialog.indirect_pct} onChange={(e) => setOverrideDialog(d => ({ ...d, indirect_pct: e.target.value, direct_pct: Math.max(0, 100 - Number(e.target.value)) }))} data-testid="cf-override-indirect" />
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-amber-50/40 border-amber-200">
              <label className="flex items-start gap-2 cursor-pointer text-xs">
                <input type="checkbox" className="mt-0.5" checked={overrideDialog.apply_retroactively} onChange={(e) => setOverrideDialog(d => ({ ...d, apply_retroactively: e.target.checked }))} data-testid="cf-override-retro" />
                <span>
                  <strong className="text-amber-800">Recompute past income</strong>
                  <span className="block text-gray-600">Re-allocate all prior approved income rows for this project using the new split. Otherwise, only new income from now on uses it.</span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog({ open: false, project: null, direct_pct: 85, indirect_pct: 15, apply_retroactively: false })}>Cancel</Button>
            <Button onClick={submitOverride} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="cf-override-save">{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
