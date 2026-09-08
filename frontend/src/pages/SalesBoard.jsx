import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { Users, CalendarCheck, FileText, TrendingUp, RefreshCw } from 'lucide-react';

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
    // Monday-start week.
    const dow = (start.getDay() + 6) % 7;
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
  { key: 'leads', label: 'Leads', hint: 'Total new Pre-Sales leads', Icon: Users, accent: 'border-l-indigo-500', color: 'text-indigo-700' },
  { key: 'appointments', label: 'Appointment', hint: 'Pre-Sales appointments booked', Icon: CalendarCheck, accent: 'border-l-emerald-500', color: 'text-emerald-700' },
  { key: 'proposals', label: 'Proposal', hint: 'RE sent to client (RE - Client)', Icon: FileText, accent: 'border-l-amber-500', color: 'text-amber-700' },
  { key: 'sales', label: 'Sales', hint: 'Deals closed', Icon: TrendingUp, accent: 'border-l-rose-500', color: 'text-rose-700' },
];

export default function SalesBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(PRESETS.today());
  const [summary, setSummary] = useState(null);
  const [sLoading, setSLoading] = useState(false);

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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="sales-masterview-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="sales-masterview-title">Sales Masterview</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
            </p>
          </div>
          <button
            onClick={fetchSummary}
            disabled={sLoading}
            data-testid="sales-masterview-refresh"
            className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${sLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Date range preset filter */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap" data-testid="sales-masterview-date-presets">
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

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="sales-masterview-cards">
          {CARDS.map(c => {
            const Icon = c.Icon;
            return (
              <Card key={c.key} className={`border-l-4 ${c.accent}`} data-testid={`sales-masterview-card-${c.key}`}>
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
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
