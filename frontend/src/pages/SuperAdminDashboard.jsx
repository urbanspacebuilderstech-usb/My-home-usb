import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Wallet, Package, HardHat, Users, Building2, UserRound, RefreshCw,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Aug 29 2026 — same date-preset shape as Sales Masterview.
const PRESETS = {
  today: () => { const d = new Date(); return { start: toYMD(d), end: toYMD(d) }; },
  yesterday: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: toYMD(d), end: toYMD(d) }; },
  week: () => {
    const end = new Date();
    const start = new Date();
    const dow = (start.getDay() + 6) % 7; // Monday-start week
    start.setDate(start.getDate() - dow);
    return { start: toYMD(start), end: toYMD(end) };
  },
  month: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toYMD(start), end: toYMD(now) };
  },
};

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function SuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(PRESETS.today());
  const [dLoading, setDLoading] = useState(false);

  const [cashbook, setCashbook] = useState(null);      // accounts + project values (row 3)
  const [materials, setMaterials] = useState(null);     // {total_value, today_in, today_out}
  const [labour, setLabour] = useState(null);           // {total, skilled, semi_skilled, unskilled}
  const [laps, setLaps] = useState(null);                // {leads, appointments, proposals, sales}
  const [projectsOverview, setProjectsOverview] = useState(null); // {total, new, ongoing, completed}
  const [hr, setHr] = useState(null);                    // {total_staff, present, absent}

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(r => setUser(r.data))
      .catch((error) => { if (error.response?.status === 401) window.location.href = '/login'; })
      .finally(() => setLoading(false));
    axios.get(`${API}/notifications`)
      .then(r => setUnreadNotifs((r.data || []).filter(n => !n.read).length))
      .catch(() => {});
  }, []);

  const applyPreset = (key) => { setPreset(key); setRange(PRESETS[key]()); };
  const applyCustomDate = (which, value) => {
    if (!value) return;
    setPreset('custom');
    setRange(prev => {
      const next = { ...prev, [which]: value };
      if (next.start > next.end) { if (which === 'start') next.end = value; else next.start = value; }
      return next;
    });
  };

  const fetchAll = useCallback(async () => {
    setDLoading(true);
    const dateParams = new URLSearchParams({ start_date: range.start, end_date: range.end });

    const results = await Promise.allSettled([
      axios.get(`${API}/accountant/cashbook-filtered?${dateParams}`),
      axios.get(`${API}/planning/inventory-summary?${dateParams}`),
      axios.get(`${API}/dashboard/labour-summary?${dateParams}`),
      axios.get(`${API}/crm/sales-masterview/summary?${dateParams}`),
      axios.get(`${API}/dashboard/projects-overview`),
      axios.get(`${API}/dashboard/hr-summary?date=${range.end}`),
    ]);
    const [cbRes, matRes, labRes, lapsRes, projRes, hrRes] = results;

    setCashbook(cbRes.status === 'fulfilled' ? cbRes.value.data : null);

    if (matRes.status === 'fulfilled') {
      const rows = matRes.value.data?.rows || [];
      const agg = rows.reduce((acc, r) => {
        const rate = Number(r.unit_rate) || 0;
        acc.total_value += r.current_sv != null ? Number(r.current_sv) || 0 : (Number(r.current_stock) || 0) * rate;
        acc.today_in += (Number(r.today_in) || 0) * rate;
        acc.today_out += (Number(r.today_out) || 0) * rate;
        return acc;
      }, { total_value: 0, today_in: 0, today_out: 0 });
      setMaterials(agg);
    } else {
      setMaterials(null);
    }

    setLabour(labRes.status === 'fulfilled' ? labRes.value.data : null);
    setLaps(lapsRes.status === 'fulfilled' ? lapsRes.value.data : null);
    setProjectsOverview(projRes.status === 'fulfilled' ? projRes.value.data : null);
    setHr(hrRes.status === 'fulfilled' ? hrRes.value.data : null);

    setDLoading(false);
  }, [range]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const s = cashbook?.summary || {};

  return (
    <div className="min-h-screen bg-gray-50" data-testid="super-admin-dashboard-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="w-full px-4 sm:px-6 lg:px-10 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="dashboard-title">Dashboard</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={dLoading}
            data-testid="dashboard-refresh"
            className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${dLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Date range: presets + custom */}
        <div className="flex items-center gap-3 mb-5 flex-wrap" data-testid="dashboard-date-filter">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { k: 'today', label: 'Today' },
              { k: 'yesterday', label: 'Yesterday' },
              { k: 'week', label: 'This Week' },
              { k: 'month', label: 'This Month' },
            ].map(p => (
              <button
                key={p.k}
                onClick={() => applyPreset(p.k)}
                data-testid={`dashboard-preset-${p.k}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  preset === p.k ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-3 pr-1.5 py-1">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Custom</span>
            <input type="date" value={range.start} max={range.end} onChange={(e) => applyCustomDate('start', e.target.value)} className="text-xs border-0 focus:outline-none focus:ring-0 bg-transparent" data-testid="dashboard-custom-start" />
            <span className="text-gray-300">→</span>
            <input type="date" value={range.end} min={range.start} onChange={(e) => applyCustomDate('end', e.target.value)} className="text-xs border-0 focus:outline-none focus:ring-0 bg-transparent" data-testid="dashboard-custom-end" />
          </div>
        </div>

        {/* ── Row 1: Accounts | Materials | Labour ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <Card className="border-t-4 border-t-blue-400" data-testid="dashboard-card-accounts">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><Wallet className="h-4 w-4 text-blue-600" /><span className="text-sm font-bold text-gray-800">Accounts</span></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400 uppercase">Income</p><p className="text-sm font-bold text-emerald-700">{dLoading ? '…' : fmt(s.total_income)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Expense</p><p className="text-sm font-bold text-red-700">{dLoading ? '…' : fmt(s.total_expense)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Balance</p><p className="text-sm font-bold text-blue-700">{dLoading ? '…' : fmt(s.net_balance)}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-400" data-testid="dashboard-card-materials">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><Package className="h-4 w-4 text-indigo-600" /><span className="text-sm font-bold text-gray-800">Materials</span></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400 uppercase">Today Inward</p><p className="text-sm font-bold text-emerald-700">{dLoading ? '…' : fmt(materials?.today_in)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Today Outward</p><p className="text-sm font-bold text-red-700">{dLoading ? '…' : fmt(materials?.today_out)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Total Material</p><p className="text-sm font-bold text-indigo-700">{dLoading ? '…' : fmt(materials?.total_value)}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-amber-400" data-testid="dashboard-card-labour">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><HardHat className="h-4 w-4 text-amber-600" /><span className="text-sm font-bold text-gray-800">Labour</span></div>
              <div className="space-y-1.5">
                {[
                  { label: 'Total Labour', d: labour?.total, cls: 'text-gray-800' },
                  { label: 'Skilled', d: labour?.skilled, cls: 'text-blue-700' },
                  { label: 'Semi-Skilled', d: labour?.semi_skilled, cls: 'text-amber-700' },
                  { label: 'Unskilled', d: labour?.unskilled, cls: 'text-gray-600' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{row.label}</span>
                    <span className={`font-semibold ${row.cls}`}>
                      {dLoading ? '…' : `${row.d?.count ?? 0} · ${fmt(row.d?.amount)}`}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 2: Sales (LAPS) | Projects Overview | HR ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <Card className="border-t-4 border-t-rose-400" data-testid="dashboard-card-sales">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-rose-600" /><span className="text-sm font-bold text-gray-800">Sales (LAPS)</span></div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400 uppercase">Leads</p><p className="text-base font-bold text-indigo-700">{dLoading ? '…' : (laps?.leads ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Appt</p><p className="text-base font-bold text-emerald-700">{dLoading ? '…' : (laps?.appointments ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Proposal</p><p className="text-base font-bold text-amber-700">{dLoading ? '…' : (laps?.proposals ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Sales</p><p className="text-base font-bold text-rose-700">{dLoading ? '…' : (laps?.sales ?? 0)}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-400" data-testid="dashboard-card-projects">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><Building2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-bold text-gray-800">Projects Overview</span></div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400 uppercase">Total</p><p className="text-base font-bold text-gray-800">{dLoading ? '…' : (projectsOverview?.total ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">New</p><p className="text-base font-bold text-indigo-700">{dLoading ? '…' : (projectsOverview?.new ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Ongoing</p><p className="text-base font-bold text-amber-700">{dLoading ? '…' : (projectsOverview?.ongoing ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Completed</p><p className="text-base font-bold text-emerald-700">{dLoading ? '…' : (projectsOverview?.completed ?? 0)}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-violet-400" data-testid="dashboard-card-hr">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><UserRound className="h-4 w-4 text-violet-600" /><span className="text-sm font-bold text-gray-800">HR</span></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400 uppercase">Total Employees</p><p className="text-sm font-bold text-gray-800">{dLoading ? '…' : (hr?.total_staff ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Present</p><p className="text-sm font-bold text-emerald-700">{dLoading ? '…' : (hr?.present ?? 0)}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase">Absent</p><p className="text-sm font-bold text-red-700">{dLoading ? '…' : (hr?.absent ?? 0)}</p></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3: Project Values — same card as Finance Board > Accounts > Project Wise ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="dashboard-card-project-values">
          <Card className="border-t-4 border-t-indigo-300 bg-indigo-50/30">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-indigo-700/80 font-bold mb-2">Project Value Calculation</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white rounded-md border border-blue-200 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Scope Value</p>
                  <p className="text-sm font-bold text-blue-700 mt-1 break-words">{dLoading ? '…' : fmt(s.scope_value)}</p>
                </div>
                <div className="bg-white rounded-md border border-cyan-200 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Additions</p>
                  <p className="text-sm font-bold text-cyan-700 mt-1 break-words">{dLoading ? '…' : fmt(s.additions_total)}</p>
                </div>
                <div className="bg-white rounded-md border border-orange-200 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Deductions</p>
                  <p className="text-sm font-bold text-orange-700 mt-1 break-words">{dLoading ? '…' : fmt(s.deductions_total)}</p>
                </div>
                <div className="bg-indigo-600 rounded-md p-2.5 text-center">
                  <p className="text-[10px] uppercase text-indigo-100 font-semibold">Grand Total</p>
                  <p className="text-sm font-bold text-white mt-1 break-words">{dLoading ? '…' : fmt(s.grand_total_value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-300 bg-emerald-50/30">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-bold mb-2">Financial Performance</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white rounded-md border border-emerald-200 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Income</p>
                  <p className="text-sm font-bold text-emerald-700 mt-1 break-words">{dLoading ? '…' : fmt(s.total_income)}</p>
                </div>
                <div className="bg-white rounded-md border border-red-200 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Expense</p>
                  <p className="text-sm font-bold text-red-700 mt-1 break-words">{dLoading ? '…' : fmt(s.total_expense)}</p>
                </div>
                <div className="bg-white rounded-md border border-blue-200 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Balance</p>
                  <p className="text-sm font-bold text-blue-700 mt-1 break-words">{dLoading ? '…' : fmt(s.net_balance)}</p>
                </div>
                <div className="bg-amber-600 rounded-md p-2.5 text-center">
                  <p className="text-[10px] uppercase text-amber-100 font-semibold">Receivable</p>
                  <p className="text-sm font-bold text-white mt-1 break-words">{dLoading ? '…' : fmt(s.receivable)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
