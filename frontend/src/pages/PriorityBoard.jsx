import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { RefreshCw, ExternalLink, Search, Trash2 } from 'lucide-react';

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

// Same short formatter as Sales CRM's chips: ₹12k / ₹45.00L / ₹3.43Cr.
const formatINRShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(v >= 100000000 ? 0 : 2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(v >= 1000000 ? 1 : 2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${v.toFixed(0)}`;
};
const VALUE_TABS = new Set(['P1', 'P2', 'P3']);

const cleanPhone = (p) => (p ? String(p).replace(/^p:/i, '').trim() : '—');

const fmtDate = (s) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

const fmtTime = (s) => {
  if (!s) return '';
  try {
    return new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

// Day heading in the Deleted Leads timeline: Today / Yesterday / 27 Sep 2026.
const dayLabel = (s) => {
  const d = new Date(s);
  if (isNaN(d)) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fmtDate(s);
};

const ROLE_LABELS = { super_admin: 'Super Admin', sales_head: 'Sales Head', pre_sales: 'Pre-Sales', sales: 'Sales', cre: 'CRE' };

export default function PriorityBoard() {
  const [user, setUser] = useState(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState('P1');
  const [rnrMin, setRnrMin] = useState(3);
  const [q, setQ] = useState('');
  // Sep 29 2026 — Deleted Leads timeline (every delete from Pre-Sales, Sales
  // and the Marketing Board), opened from the button beside Refresh.
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [deleted, setDeleted] = useState(null);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedQ, setDeletedQ] = useState('');

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

  const openDeleted = async () => {
    setDeletedOpen(true);
    setDeletedLoading(true);
    try {
      const r = await axios.get(`${API}/crm/deleted-leads`);
      setDeleted(r.data || []);
    } catch {
      setDeleted([]);
    } finally {
      setDeletedLoading(false);
    }
  };

  const deletedGroups = useMemo(() => {
    const term = deletedQ.trim().toLowerCase();
    const list = (deleted || []).filter(d => !term || [d.name, d.phone, d.city, d.assigned_to_name,
      d.deleted_by_name, d.current_stage_name].some(v => (v || '').toString().toLowerCase().includes(term)));
    // Already newest first, so consecutive rows share a day.
    const groups = [];
    for (const d of list) {
      const label = dayLabel(d.deleted_at);
      if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] });
      groups[groups.length - 1].items.push(d);
    }
    return groups;
  }, [deleted, deletedQ]);

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => load()}
              disabled={loading}
              className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
              title="Refresh"
              data-testid="priority-board-refresh"
            >
              <RefreshCw className={`h-4 w-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={openDeleted}
              className="h-9 px-3 rounded-md border border-gray-200 bg-white flex items-center gap-1.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
              title="Deleted leads timeline"
              data-testid="priority-board-deleted-leads"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Deleted Leads</span>
            </button>
          </div>
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
                {VALUE_TABS.has(t.key) && (
                  <span className="text-sm sm:text-lg font-bold opacity-95 mt-1 leading-tight" data-testid={`priority-tab-value-${t.key}`}>
                    {loading && !data ? '' : formatINRShort(data?.amounts?.[t.key])}
                  </span>
                )}
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

      <Sheet open={deletedOpen} onOpenChange={setDeletedOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col gap-0" data-testid="deleted-leads-sheet">
          <SheetHeader className="px-5 pt-5 pb-3 border-b text-left">
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" /> Deleted Leads
            </SheetTitle>
            <SheetDescription className="text-xs">
              Leads deleted from Pre-Sales, Sales and the Marketing Board, newest first.
            </SheetDescription>
            <div className="relative pt-2">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 mt-1" />
              <input
                value={deletedQ}
                onChange={(e) => setDeletedQ(e.target.value)}
                placeholder="Search lead, assignee, deleted by…"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                data-testid="deleted-leads-search"
              />
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {deletedLoading && !deleted ? (
              <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
            ) : deletedGroups.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">
                {deletedQ ? 'No deleted leads match your search.' : 'No leads have been deleted.'}
              </p>
            ) : deletedGroups.map(g => (
              <div key={g.label} className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">{g.label}</p>
                <ol className="border-l border-gray-200 ml-1.5 space-y-4">
                  {g.items.map(d => (
                    <li key={d.deletion_id} className="relative pl-4" data-testid={`deleted-lead-${d.lead_id}`}>
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm truncate" title={d.name || ''}>{d.name || '—'}</p>
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">{fmtTime(d.deleted_at)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {(d.stage_type === 'pre_sales' || d.stage_type === 'sales') && (
                          <span className={`inline-block whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded-full border ${d.stage_type === 'pre_sales' ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                            {d.stage_type === 'pre_sales' ? 'Pre Sales' : 'Sales'}
                          </span>
                        )}
                        {d.current_stage_name && <span className="text-[11px] text-gray-600">{d.current_stage_name}</span>}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {[d.phone && cleanPhone(d.phone), d.city, `Assigned to ${d.assigned_to_name || '—'}`].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        Deleted by <strong>{d.deleted_by_name || '—'}</strong>
                        {d.deleted_by_role ? ` (${ROLE_LABELS[d.deleted_by_role] || d.deleted_by_role})` : ''}
                        {d.deleted_from === 'marketing' ? ' · via Marketing Board' : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <MobileBottomNav user={user} />
    </div>
  );
}
