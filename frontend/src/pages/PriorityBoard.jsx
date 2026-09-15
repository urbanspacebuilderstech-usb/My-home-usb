import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { RefreshCw, ExternalLink, Search } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Sep 15 2026 — Sales Head's Priority Board. The bucket rules live server-side
// in crm.py `priority_bucket`, so these tabs can never count a lead differently
// from Sales CRM's own P1/P2/P3 chips. Colours match those chips
// (P1 red · P2 amber · P3 blue).
const TABS = [
  { key: 'P3', label: 'P3', color: '#3b82f6', hint: 'Cold' },
  { key: 'P2', label: 'P2', color: '#f59e0b', hint: 'Warm' },
  { key: 'P1', label: 'P1', color: '#dc2626', hint: 'Hottest' },
  { key: 'long_rnr', label: 'Long RNR', color: '#9333ea', hint: 'Ringing, no response' },
  { key: 'declined', label: 'Declined', color: '#6b7280', hint: 'Lost' },
];

const fmtDate = (s) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

export default function PriorityBoard() {
  const [user, setUser] = useState(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState('P1');
  const [rnrMin, setRnrMin] = useState(3);
  const [q, setQ] = useState('');

  useEffect(() => {
    axios.get(`${API}/auth/me`).then(r => setUser(r.data)).catch(() => {});
    axios.get(`${API}/notifications`)
      .then(r => setUnreadNotifs((r.data || []).filter(n => !n.read).length))
      .catch(() => {});
  }, []);

  const load = async (min = rnrMin) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/crm/priority-board`, { params: { rnr_min: min } });
      setData(r.data);
    } catch (e) {
      if (e.response?.status === 403) window.location.href = '/dashboard';
      setData({ counts: {}, leads: {} });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(rnrMin); }, [rnrMin]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const list = (data?.leads?.[active]) || [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(l => [l.name, l.phone, l.city, l.assigned_to_name, l.current_stage_name,
      l.client_category_value, l.lost_reason].some(v => (v || '').toString().toLowerCase().includes(term)));
  }, [data, active, q]);

  // Open the lead in the CRM that owns it — both pages already honour ?lead=<id>.
  const openLead = (l) => {
    const base = l.stage_type === 'pre_sales' ? '/crm-pre-sales' : '/crm-sales';
    window.location.href = `${base}?lead=${encodeURIComponent(l.lead_id)}`;
  };

  const activeTab = TABS.find(t => t.key === active);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="priority-board-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="w-full px-4 sm:px-6 lg:px-10 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Priority Board</h2>
            <p className="text-xs text-gray-500 mt-0.5">Active priority leads, long RNR follow-ups and declined leads across the team</p>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            title="Refresh"
            data-testid="priority-board-refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Round tabs */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-6" data-testid="priority-board-tabs">
          {TABS.map(t => {
            const isActive = active === t.key;
            const count = data?.counts?.[t.key] ?? 0;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                data-testid={`priority-tab-${t.key}`}
                className="flex flex-col items-center gap-1.5 group"
              >
                <span
                  className={`flex flex-col items-center justify-center rounded-full w-20 h-20 sm:w-24 sm:h-24 border-2 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md ${isActive ? 'scale-105' : ''}`}
                  style={{
                    backgroundColor: isActive ? t.color : `${t.color}15`,
                    borderColor: t.color,
                    color: isActive ? '#fff' : t.color,
                  }}
                >
                  <span className={`font-bold leading-none ${t.label.length > 3 ? 'text-xs sm:text-sm' : 'text-lg sm:text-xl'}`}>{t.label}</span>
                  <span className="text-lg sm:text-xl font-bold mt-1 leading-none">{loading && !data ? '…' : count}</span>
                </span>
                <span className={`text-[11px] ${isActive ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{t.hint}</span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, city, assignee…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              data-testid="priority-board-search"
            />
          </div>
          {active === 'long_rnr' && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Long RNR = at least
              <select
                value={rnrMin}
                onChange={(e) => setRnrMin(Number(e.target.value))}
                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
                data-testid="priority-board-rnr-min"
              >
                {[2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              RNR attempts
            </label>
          )}
          <span className="text-xs text-gray-500 ml-auto">
            {activeTab?.label}: <strong>{rows.length}</strong>{q ? ` of ${(data?.leads?.[active] || []).length}` : ''}
          </span>
        </div>

        {/* List */}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Pipeline</th>
                <th className="px-3 py-2.5 font-medium">Stage</th>
                <th className="px-3 py-2.5 font-medium">
                  {active === 'long_rnr' ? 'RNR Attempts' : active === 'declined' ? 'Reason' : 'Priority Note'}
                </th>
                <th className="px-3 py-2.5 font-medium">Assigned To</th>
                <th className="px-3 py-2.5 font-medium">
                  {active === 'long_rnr' ? 'Last RNR' : active === 'declined' ? 'Lost On' : 'Updated'}
                </th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && !data ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  {q ? 'No leads match your search.' : `No ${activeTab?.label} leads.`}
                </td></tr>
              ) : rows.map((l, i) => (
                <tr key={l.lead_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openLead(l)}>
                  <td className="px-3 py-2.5 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-900">{l.name || '—'}</p>
                    {l.city && <p className="text-[11px] text-gray-500">{l.city}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{l.phone || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${l.stage_type === 'pre_sales' ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                      {l.stage_type === 'pre_sales' ? 'Pre Sales' : 'Sales'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{l.current_stage_name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-[260px]">
                    {active === 'long_rnr' ? (
                      <span className="font-bold text-purple-700">{l.rnr_count || 0}</span>
                    ) : active === 'declined' ? (
                      <span className="truncate block" title={l.lost_reason || ''}>{l.lost_reason || '—'}</span>
                    ) : (
                      <span className="truncate block" title={l.client_category_value || ''}>{l.client_category_value || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{l.assigned_to_name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                    {fmtDate(active === 'long_rnr' ? l.last_rnr_at : active === 'declined' ? (l.lost_at || l.updated_at) : (l.updated_at || l.created_at))}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
