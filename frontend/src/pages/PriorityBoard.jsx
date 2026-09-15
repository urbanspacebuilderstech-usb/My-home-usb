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

const cleanPhone = (p) => (p ? String(p).replace(/^p:/i, '').trim() : '—');

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

        {/* Tabs — same chip design as Sales CRM's stage summary (rounded-2xl,
            small label over a large count, tinted when idle, filled when active). */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-6" data-testid="priority-board-tabs">
          {TABS.map(t => {
            const isActive = active === t.key;
            const count = data?.counts?.[t.key] ?? 0;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                data-testid={`priority-tab-${t.key}`}
                title={t.hint}
                className={`flex flex-col items-center justify-center rounded-2xl px-1.5 py-2.5 sm:py-3 shadow-sm border transition-all hover:shadow-md hover:-translate-y-0.5 ${isActive ? 'ring-2' : ''}`}
                style={{
                  backgroundColor: isActive ? t.color : `${t.color}15`,
                  borderColor: `${t.color}30`,
                  color: isActive ? '#ffffff' : t.color,
                  '--tw-ring-color': t.color,
                }}
              >
                <span className="text-[9px] sm:text-[10px] font-medium text-center leading-tight line-clamp-2 w-full px-0.5">
                  {t.label}
                </span>
                <span className="text-base sm:text-xl font-bold mt-0.5 leading-tight">
                  {loading && !data ? '…' : count}
                </span>
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

        {/* List — fixed column widths so a long name can't swallow the row and
            push Stage / Date off-screen; narrow screens scroll instead of crushing. */}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '3%' }} />
            </colgroup>
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-3 font-semibold">#</th>
                <th className="px-3 py-3 font-semibold">Client</th>
                <th className="px-3 py-3 font-semibold">Phone</th>
                <th className="px-3 py-3 font-semibold">Pipeline</th>
                <th className="px-3 py-3 font-semibold">Stage</th>
                <th className="px-3 py-3 font-semibold">
                  {active === 'long_rnr' ? 'RNR Attempts' : active === 'declined' ? 'Reason' : 'Conditions'}
                </th>
                <th className="px-3 py-3 font-semibold">Assigned To</th>
                <th className="px-3 py-3 font-semibold">
                  {active === 'long_rnr' ? 'Last RNR' : active === 'declined' ? 'Lost On' : 'Updated'}
                </th>
                <th className="px-3 py-3"></th>
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
                <tr key={l.lead_id} className="hover:bg-gray-50 cursor-pointer align-middle" onClick={() => openLead(l)}>
                  <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-900 truncate" title={l.name || ''}>{l.name || '—'}</p>
                    {l.city && <p className="text-[11px] text-gray-500 truncate">{l.city}</p>}
                  </td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap truncate">{cleanPhone(l.phone)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded-full border ${l.stage_type === 'pre_sales' ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                      {l.stage_type === 'pre_sales' ? 'Pre Sales' : 'Sales'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700 truncate" title={l.current_stage_name || ''}>{l.current_stage_name || '—'}</td>
                  <td className="px-3 py-3 text-gray-700">
                    {active === 'long_rnr' ? (
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-purple-50 border border-purple-200 text-xs font-bold text-purple-700">{l.rnr_count || 0}</span>
                    ) : active === 'declined' ? (
                      <span className="block truncate" title={l.lost_reason || ''}>{l.lost_reason || '—'}</span>
                    ) : (
                      // Funnel conditions that justify the tier; older leads set
                      // before the checklist fall back to their free-text note.
                      <div className="min-w-0">
                        {l.client_category_auto_lowered && (
                          <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 mr-1 mb-0.5"
                                title="Not re-confirmed in time, so it dropped a level">
                            ↓ from {l.client_category_auto_lowered_from}
                          </span>
                        )}
                        {(l.client_category_conditions || []).length > 0 ? (
                          <span className="block truncate" title={l.client_category_conditions.join(' | ')}>
                            {l.client_category_conditions.join(' · ')}
                          </span>
                        ) : (
                          <span className="block truncate text-gray-400" title={l.client_category_value || ''}>
                            {l.client_category_value ? `Note: ${l.client_category_value}` : 'No conditions yet'}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-700 truncate" title={l.assigned_to_name || ''}>{l.assigned_to_name || '—'}</td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                    {fmtDate(active === 'long_rnr' ? l.last_rnr_at : active === 'declined' ? (l.lost_at || l.updated_at) : (l.updated_at || l.created_at))}
                  </td>
                  <td className="px-2 py-3 text-right">
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
