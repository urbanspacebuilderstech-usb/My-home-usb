import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { Users, CalendarCheck, FileText, TrendingUp, RefreshCw, ExternalLink, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Aug 29 2026 — Sales Masterview date presets. Each returns {start, end}
// as 'YYYY-MM-DD', both inclusive.
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

const CARDS = [
  { key: 'leads', label: 'Leads', hint: 'Total new Pre-Sales leads', Icon: Users, accent: 'border-l-indigo-500', color: 'text-indigo-700', bg: 'bg-indigo-50' },
  { key: 'appointments', label: 'Appointment', hint: 'Pre-Sales appointments booked', Icon: CalendarCheck, accent: 'border-l-emerald-500', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { key: 'proposals', label: 'Proposal', hint: 'RE sent to client (RE - Client)', Icon: FileText, accent: 'border-l-amber-500', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'sales', label: 'Sales', hint: 'Deals closed', Icon: TrendingUp, accent: 'border-l-rose-500', color: 'text-rose-700', bg: 'bg-rose-50' },
];

const WHEN_LABEL = {
  leads: 'Created',
  appointments: 'Appointment booked',
  proposals: 'RE sent to client',
  sales: 'Deal closed',
};

export default function SalesBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(PRESETS.today());
  const [summary, setSummary] = useState(null);
  const [sLoading, setSLoading] = useState(false);

  // Aug 29 2026 — click-through row view (LAPS = Leads/Appointment/Proposal/Sales)
  const [activeCard, setActiveCard] = useState(null); // 'leads' | 'appointments' | 'proposals' | 'sales' | null
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(r => setUser(r.data))
      .catch((error) => { if (error.response?.status === 401) window.location.href = '/login'; })
      .finally(() => setLoading(false));
    axios.get(`${API}/notifications`)
      .then(r => setUnreadNotifs((r.data || []).filter(n => !n.read).length))
      .catch(() => {});
  }, []);

  const applyPreset = (key) => {
    setPreset(key);
    setRange(PRESETS[key]());
  };

  const applyCustomDate = (which, value) => {
    if (!value) return;
    setPreset('custom');
    setRange(prev => {
      const next = { ...prev, [which]: value };
      // Keep start <= end.
      if (next.start > next.end) {
        if (which === 'start') next.end = value; else next.start = value;
      }
      return next;
    });
  };

  const fetchSummary = useCallback(async () => {
    setSLoading(true);
    try {
      const params = new URLSearchParams({ start_date: range.start, end_date: range.end });
      const res = await axios.get(`${API}/crm/sales-masterview/summary?${params}`);
      setSummary(res.data);
    } catch {
      setSummary(null);
    } finally {
      setSLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Re-pull the open card's rows whenever the date range changes too, so the
  // drill-down stays "synced with pre sales/sales" instead of going stale.
  const fetchRows = useCallback(async (category) => {
    setRowsLoading(true);
    try {
      const params = new URLSearchParams({ category, start_date: range.start, end_date: range.end });
      const res = await axios.get(`${API}/crm/sales-masterview/rows?${params}`);
      setRows(res.data?.rows || []);
    } catch {
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (activeCard) fetchRows(activeCard);
  }, [activeCard, fetchRows]);

  const toggleCard = (key) => {
    setActiveCard(prev => (prev === key ? null : key));
  };

  const crmLink = (row) => {
    const base = row.stage_type === 'pre_sales' ? '/crm-pre-sales' : '/crm-sales';
    return `${base}?lead=${encodeURIComponent(row.lead_id)}`;
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeCardMeta = CARDS.find(c => c.key === activeCard);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="sales-masterview-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="w-full px-4 sm:px-6 lg:px-10 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="sales-masterview-title">Sales Masterview</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
            </p>
          </div>
          <button
            onClick={() => { fetchSummary(); if (activeCard) fetchRows(activeCard); }}
            disabled={sLoading}
            data-testid="sales-masterview-refresh"
            className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${sLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Date range: presets + a custom range */}
        <div className="flex items-center gap-3 mb-5 flex-wrap" data-testid="sales-masterview-date-filter">
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
                data-testid={`sales-masterview-preset-${p.k}`}
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
            <input
              type="date"
              value={range.start}
              max={range.end}
              onChange={(e) => applyCustomDate('start', e.target.value)}
              className="text-xs border-0 focus:outline-none focus:ring-0 bg-transparent"
              data-testid="sales-masterview-custom-start"
            />
            <span className="text-gray-300">→</span>
            <input
              type="date"
              value={range.end}
              min={range.start}
              onChange={(e) => applyCustomDate('end', e.target.value)}
              className="text-xs border-0 focus:outline-none focus:ring-0 bg-transparent"
              data-testid="sales-masterview-custom-end"
            />
          </div>
        </div>

        {/* Summary cards — click to drill into the matching rows */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="sales-masterview-cards">
          {CARDS.map(c => {
            const Icon = c.Icon;
            const isActive = activeCard === c.key;
            return (
              <Card
                key={c.key}
                className={`border-l-4 ${c.accent} cursor-pointer transition-shadow hover:shadow-md ${isActive ? 'ring-2 ring-offset-1 ring-amber-400' : ''}`}
                onClick={() => toggleCard(c.key)}
                data-testid={`sales-masterview-card-${c.key}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase font-semibold text-gray-500 tracking-wide">{c.label}</p>
                    <Icon className={`h-4 w-4 ${c.color}`} />
                  </div>
                  <p className={`text-2xl sm:text-3xl font-bold ${c.color}`}>
                    {sLoading ? '…' : (summary ? (summary[c.key] ?? 0) : '—')}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">{c.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Drill-down row view — the real lead records behind whichever card is open */}
        {activeCard && (
          <Card className="mt-4" data-testid="sales-masterview-rows-card">
            <CardContent className="p-0">
              <div className={`flex items-center justify-between px-4 py-3 border-b ${activeCardMeta?.bg || ''}`}>
                <div className="flex items-center gap-2">
                  {activeCardMeta && <activeCardMeta.Icon className={`h-4 w-4 ${activeCardMeta.color}`} />}
                  <span className={`text-sm font-semibold ${activeCardMeta?.color || 'text-gray-800'}`}>
                    {activeCardMeta?.label} ({rowsLoading ? '…' : rows.length})
                  </span>
                </div>
                <button
                  onClick={() => setActiveCard(null)}
                  className="text-gray-400 hover:text-gray-700"
                  data-testid="sales-masterview-rows-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="sales-masterview-rows-table">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Name</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Phone</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Stage</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Assigned To</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{activeCard ? WHEN_LABEL[activeCard] : 'Date'}</th>
                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rowsLoading ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-sm">No entries in this range</td></tr>
                    ) : rows.map((r, idx) => (
                      <tr key={r.lead_id || idx} className="hover:bg-gray-50" data-testid={`sales-masterview-row-${idx}`}>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.phone || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.current_stage_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.assigned_to_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.when ? new Date(r.when).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => window.open(crmLink(r), '_blank')}
                            data-testid={`sales-masterview-view-${idx}`}
                          >
                            <ExternalLink className="h-3 w-3" /> View
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
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
