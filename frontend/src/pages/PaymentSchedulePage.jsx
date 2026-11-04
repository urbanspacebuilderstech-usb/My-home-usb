import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  ArrowRight,
  IndianRupee,
  RefreshCw,
  Calendar,
  Eye,
  Search,
  X
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useNavigate } from 'react-router-dom';
import { PaymentStageDetailDialog } from '../components/PaymentStageDetailDialog';
import MetaDateFilter from '../components/MetaDateFilter';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_CHIPS = {
  requested: { label: 'Req. Raised', cls: 'bg-blue-100 text-blue-700' },
  pending_collection: { label: 'Pending Collection', cls: 'bg-indigo-100 text-indigo-700' },
  pending: { label: 'Not Collected', cls: 'bg-gray-100 text-gray-700' },
  partial: { label: 'Partially Collected', cls: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
  collected: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
};
const statusChip = (e) => STATUS_CHIPS[e.workflow_status] || STATUS_CHIPS[e.stage_status] || STATUS_CHIPS.pending;

export default function PaymentSchedulePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState({ entries: [], summary: {} });
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [subTab, setSubTab] = useState('pending'); // pending | collected | all
  const [dateRange, setDateRange] = useState(null); // {from, to} filter within schedule
  const [searchQuery, setSearchQuery] = useState('');
  // Super-Admin View popup state
  const [stageDetailDlg, setStageDetailDlg] = useState({ open: false, stageId: null });
  const navigate = useNavigate();

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const r = await axios.get(`${API}/auth/me`);
      setUser(r.data);
      fetchSchedule(month, year);
    } catch { window.location.href = '/login'; }
    finally { setLoading(false); }
  };

  const fetchSchedule = async (m, y) => {
    try {
      const r = await axios.get(`${API}/planning/monthly-schedule?month=${m}&year=${y}`);
      setSchedule(r.data || { entries: [], summary: {} });
    } catch { }
  };

  const changeMonth = (dir) => {
    let m = month + dir, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
    fetchSchedule(m, y);
  };

  const formatCurrency = (a) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);

  const isCollectedEntry = (e) => {
    const hasPendingApproval = (e.pending_approval_count || 0) > 0;
    if (hasPendingApproval) return false;
    const s = (e.stage_status || e.status || '').toLowerCase();
    const ws = (e.workflow_status || '').toLowerCase();
    if (s === 'paid' || s === 'collected') return true;
    if (ws === 'collected') {
      const balance = (e.amount || 0) - (e.amount_received || 0);
      return balance <= 1;
    }
    return false;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;

  const allEntries = schedule.entries || [];
  const pendingArr = allEntries.filter(e => !isCollectedEntry(e));
  const collectedArr = allEntries.filter(isCollectedEntry);
  const baseEntries = subTab === 'pending' ? pendingArr : subTab === 'collected' ? collectedArr : allEntries;

  // Apply Search + Date filter (Feb 2026) — plain filter, not useMemo,
  // because hooks cannot run after the `if (loading) return ...` above.
  const q = searchQuery.trim().toLowerCase();
  const fromTs = dateRange?.from ? new Date(dateRange.from + 'T00:00:00').getTime() : null;
  const toTs = dateRange?.to ? new Date(dateRange.to + 'T23:59:59').getTime() : null;
  const entries = baseEntries.filter(e => {
    if (q) {
      const hay = [
        e.project_name, e.client_name, e.stage_name, e.stage_title,
        e.stage_description, e.description, e.sub_stage_name,
      ].filter(Boolean).join(' | ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (fromTs || toTs) {
      const dRaw = e.expected_at || e.due_date || e.scheduled_date || e.created_at;
      if (!dRaw) return false;
      const t = new Date(dRaw).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
    }
    return true;
  });
  const sum = schedule.summary || {};
  const openProject = (e) => navigate(`/projects/${e.project_id}`);
  const viewButton = (e, testId, cls) => user?.role === 'super_admin' && e.stage_id && (
    <Button
      size="sm"
      variant="ghost"
      className={`p-0 text-blue-600 hover:bg-blue-50 ${cls}`}
      title="View stage details"
      onClick={(ev) => { ev.stopPropagation(); setStageDetailDlg({ open: true, stageId: e.stage_id }); }}
      data-testid={testId}
    >
      <Eye className="h-4 w-4" />
    </Button>
  );
  const carryoverBadge = (e) => e.is_carryover && (
    <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] mt-0.5">Due from {MONTH_NAMES[e.carry_from_month]} {e.carry_from_year}</Badge>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Month Nav */}
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => changeMonth(-1)} data-testid="prev-month"><ArrowRight className="h-4 w-4 rotate-180" /></Button>
                <div className="text-center min-w-[160px]">
                  <p className="text-lg font-bold text-gray-900 flex items-center justify-center gap-2" data-testid="current-month">
                    <Calendar className="h-5 w-5 text-amber-600" /> {MONTH_NAMES[month]} {year}
                  </p>
                  <p className="text-xs text-gray-500">Monthly Payment Schedule</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => changeMonth(1)} data-testid="next-month"><ArrowRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Total Planned', value: formatCurrency(sum.total_planned), sub: `${sum.total_entries || 0} stages`, color: 'indigo' },
            { label: 'Collected', value: formatCurrency(sum.total_received), sub: `${sum.collected_count || 0} collected`, color: 'green' },
            { label: 'Balance', value: formatCurrency(sum.total_balance), sub: '', color: 'amber' },
            { label: 'Carry Over', value: sum.carryover_count || 0, sub: 'from prev months', color: 'red' },
            // Nov 4 2026 — the fifth tile sat alone on its row on phones.
            { label: 'Requested', value: sum.requested_count || 0, sub: 'sent to CRE', color: 'blue', wide: true },
          ].map(c => (
            <Card key={c.label} className={`border-l-4 border-l-${c.color}-500 ${c.wide ? 'col-span-2 sm:col-span-1' : ''}`}>
              <CardContent className="p-3">
                <p className="text-[10px] text-gray-500 uppercase font-medium">{c.label}</p>
                <p className={`text-lg font-bold text-${c.color}-700`}>{c.value}</p>
                {c.sub && <p className="text-[10px] text-gray-400">{c.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sub-tabs: Pending | Collected | All */}
        <div className="flex gap-2 flex-wrap mb-3 items-center" data-testid="acc-ps-subtabs">
          {[
            { key: 'pending', label: 'Pending', count: pendingArr.length, activeBg: 'bg-amber-600' },
            { key: 'collected', label: 'Collected', count: collectedArr.length, activeBg: 'bg-emerald-600' },
            { key: 'all', label: 'All', count: allEntries.length, activeBg: 'bg-slate-700' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              data-testid={`acc-ps-subtab-${t.key}`}
              className={`px-4 py-1.5 text-sm rounded-full border transition-colors flex items-center gap-1.5 ${
                subTab === t.key
                  ? `${t.activeBg} text-white border-transparent shadow-sm`
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`${subTab === t.key ? 'bg-white/25 text-white' : 'bg-red-500 text-white'} text-[10px] h-5 min-w-[20px] px-1.5 rounded-full inline-flex items-center justify-center font-semibold`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
          {/* Date filter + Search bar (Feb 2026) */}
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto flex-wrap">
            <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset={null} />
            <div className="relative flex-1 min-w-0 sm:flex-none">
              <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search project, client, stage…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-xs w-full sm:w-64 bg-white"
                data-testid="ps-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  data-testid="ps-search-clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-green-600" />
              {MONTH_NAMES[month]} {year} — {subTab === 'pending' ? 'Pending' : subTab === 'collected' ? 'Collected' : 'All Payment Entries'} ({entries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Nov 4 2026 — phones get one card per stage instead of the
                7-column table (Received, Balance, Status and View were off
                screen). Tapping a card opens the project, like a row. The
                tiles above carry the totals, so no Total card. */}
            <div className="md:hidden divide-y border-t" data-testid="schedule-cards">
              {entries.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-400">No entries for {MONTH_NAMES[month]} {year}</p>
              ) : entries.map(e => {
                const sc = statusChip(e);
                return (
                  <div
                    key={e.entry_id}
                    role="button"
                    tabIndex={0}
                    className="px-4 py-3 space-y-2 cursor-pointer hover:bg-indigo-50/50 focus:outline-none focus-visible:bg-indigo-50/50"
                    onClick={() => openProject(e)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openProject(e); } }}
                    data-testid={`schedule-card-${e.entry_id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-indigo-700 break-words">{e.project_name}</p>
                        <p className="text-[10px] text-gray-400 break-words">{e.client_name}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sc.cls}`}>{sc.label}</span>
                        {viewButton(e, `acc-ps-view-card-${e.entry_id}`, 'h-8 w-8')}
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="font-medium text-gray-900">Stage {e.stage_label}</span>
                      <p className="text-gray-500 break-words">{e.stage_name}</p>
                      {carryoverBadge(e)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="min-w-0 rounded-md bg-gray-50 px-2 py-1.5">
                        <p className="text-[10px] uppercase text-gray-500">Amount</p>
                        <p className="font-medium break-words">{formatCurrency(e.amount)}</p>
                      </div>
                      <div className="min-w-0 rounded-md bg-green-50/60 px-2 py-1.5">
                        <p className="text-[10px] uppercase text-gray-500">Received</p>
                        <p className="font-medium text-green-600 break-words">{formatCurrency(e.amount_received)}</p>
                      </div>
                      <div className="min-w-0 rounded-md bg-red-50/60 px-2 py-1.5">
                        <p className="text-[10px] uppercase text-gray-500">Balance</p>
                        <p className="font-medium text-red-600 break-words">{formatCurrency((e.amount || 0) - (e.amount_received || 0))}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm" data-testid="schedule-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.length === 0 ? (
                    <tr><td colSpan="7" className="p-8 text-center text-gray-400">No entries for {MONTH_NAMES[month]} {year}</td></tr>
                  ) : entries.map(e => {
                    const balance = (e.amount || 0) - (e.amount_received || 0);
                    const sc = statusChip(e);
                    return (
                      <tr key={e.entry_id} className="hover:bg-indigo-50/50 cursor-pointer" onClick={() => openProject(e)}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-indigo-700">{e.project_name}</p>
                          <p className="text-[10px] text-gray-400">{e.client_name}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">Stage {e.stage_label}</span>
                          <p className="text-xs text-gray-500">{e.stage_name}</p>
                          {carryoverBadge(e)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(e.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-green-600 font-medium">{formatCurrency(e.amount_received)}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatCurrency(balance)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {viewButton(e, `acc-ps-view-${e.entry_id}`, 'h-7 w-7')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {entries.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr className="font-bold text-sm">
                      <td colSpan="2" className="px-4 py-2.5 text-right text-gray-600">Total</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(sum.total_planned)}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{formatCurrency(sum.total_received)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(sum.total_balance)}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav user={user} />
      <PaymentStageDetailDialog
        open={stageDetailDlg.open}
        stageId={stageDetailDlg.stageId}
        onClose={() => setStageDetailDlg({ open: false, stageId: null })}
      />
    </div>
  );
}
