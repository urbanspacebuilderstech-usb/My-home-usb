// Project Attendance / DLR view — pulls project-wide Daily Labour Report data
// from `/projects/{id}/dlr/summary`, shows summary cards + by-contractor breakdown
// + a per-day detailed entry list. Works alongside the existing Daily Entry attendance form.
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, RefreshCw, Users, Calendar, Briefcase, TrendingUp, Loader2 } from 'lucide-react';
import MetaDateFilter from './MetaDateFilter';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ProjectAttendanceDLR({ projectId, user, labourAttendance, formatCurrency, onAddDailyEntry }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      // The /summary endpoint accepts a single date param. For range filters we still pull all
      // entries and aggregate client-side (simpler than adding a new endpoint).
      const res = await axios.get(`${API}/projects/${projectId}/dlr/summary`);
      setSummary(res.data || null);
    } catch {
      setSummary(null);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Apply client-side date filter to entries
  const filteredEntries = (() => {
    const entries = summary?.entries || [];
    if (!dateRange?.from || !dateRange?.to) return entries;
    return entries.filter(e => {
      if (!e.date) return false;
      return e.date >= dateRange.from && e.date <= dateRange.to;
    });
  })();
  const filteredTotalWorkers = filteredEntries.reduce((s, e) => s + (e.total_workers || 0), 0);
  const filteredTotalCost = filteredEntries.reduce((s, e) => s + (e.total_cost || 0), 0);
  const filteredTotalDayUnits = filteredEntries.reduce((s, e) => s + (e.total_day_units || 0), 0);
  const filteredByContractor = filteredEntries.reduce((acc, e) => {
    const k = e.contractor_name || 'Unknown';
    if (!acc[k]) acc[k] = { workers: 0, cost: 0, day_units: 0, days: 0 };
    acc[k].workers += e.total_workers || 0;
    acc[k].cost += e.total_cost || 0;
    acc[k].day_units += e.total_day_units || 0;
    acc[k].days += 1;
    return acc;
  }, {});
  const filteredDates = new Set(filteredEntries.map(e => e.date)).size;

  return (
    <div className="space-y-3" data-testid="project-attendance-dlr">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Daily Labour Report (DLR)</h3>
          <p className="text-xs text-gray-500">Project-wide attendance summary, aggregated from all Work Orders.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset={null} />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={fetchSummary} data-testid="dlr-refresh">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          {['super_admin', 'planning', 'site_engineer'].includes(user?.role) && (
            <Button size="sm" className="h-8 gap-1 bg-violet-600 hover:bg-violet-700" onClick={onAddDailyEntry} data-testid="add-attendance-btn">
              <Plus className="h-3 w-3" /> Daily Entry
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards (4) */}
      {loading ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading DLR…</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" data-testid="dlr-summary-cards">
            <SummaryCard accent="blue" Icon={Users} label="Total Workers" value={filteredTotalWorkers.toLocaleString('en-IN')} sub="across all days" />
            <SummaryCard accent="emerald" Icon={TrendingUp} label="Total Day Units" value={filteredTotalDayUnits.toFixed(2)} sub="weighted by labour type" />
            <SummaryCard accent="amber" Icon={Briefcase} label="Total Cost" value={formatCurrency(filteredTotalCost)} sub={`${filteredEntries.length} entries`} />
            <SummaryCard accent="violet" Icon={Calendar} label="Unique Days" value={filteredDates.toString()} sub={`${Object.keys(filteredByContractor).length} contractors`} />
          </div>

          {/* By-contractor breakdown */}
          {Object.keys(filteredByContractor).length > 0 && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">By Contractor</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="dlr-by-contractor">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">Contractor</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">Days Worked</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">Workers</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">Day Units</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(filteredByContractor).sort((a, b) => b[1].cost - a[1].cost).map(([name, c]) => (
                        <tr key={name} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-xs">{name}</td>
                          <td className="px-3 py-2 text-center text-xs">{c.days}</td>
                          <td className="px-3 py-2 text-center text-xs font-bold text-blue-700">{c.workers}</td>
                          <td className="px-3 py-2 text-center text-xs">{c.day_units.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-emerald-700">{formatCurrency(c.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry list */}
          {filteredEntries.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="dlr-entries">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase">Contractor</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase">Work Order</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-500 uppercase">Workers</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-500 uppercase">Day Units</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredEntries.map(e => (
                        <tr key={e.dlr_id || `${e.date}-${e.work_order_id}`} className="hover:bg-gray-50" data-testid={`dlr-row-${e.dlr_id}`}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{e.date}</td>
                          <td className="px-3 py-2 text-xs">{e.contractor_name || '—'}</td>
                          <td className="px-3 py-2 text-xs"><Badge variant="outline" className="text-[10px] font-mono">#{(e.work_order_id || '').slice(-8)}</Badge></td>
                          <td className="px-3 py-2 text-center font-bold">{e.total_workers}</td>
                          <td className="px-3 py-2 text-center text-xs">{(e.total_day_units || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-emerald-700">{formatCurrency(e.total_cost || 0)}</td>
                          <td className="px-3 py-2 text-[11px] text-gray-500 max-w-[220px] truncate">{e.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30 text-gray-400" />
                <p className="text-sm text-gray-500">No DLR entries yet</p>
                <p className="text-[11px] text-gray-400 mt-1">Add a daily entry from a Work Order's DLR tab to start tracking attendance.</p>
              </CardContent>
            </Card>
          )}

          {/* Legacy attendance entries (manual) — show below if any exist */}
          {labourAttendance && labourAttendance.length > 0 && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Manual Daily Entries ({labourAttendance.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">Contractor</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">Workers</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {labourAttendance.map(a => (
                        <tr key={a.attendance_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-xs">{a.date}</td>
                          <td className="px-3 py-2 text-xs">{a.contractor_name || '—'}</td>
                          <td className="px-3 py-2 text-center text-xs font-bold">{a.total_workers}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatCurrency(a.total_cost || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ accent, Icon, label, value, sub }) {
  const palette = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  }[accent] || 'bg-gray-50 border-gray-200 text-gray-700';
  return (
    <div className={`rounded-lg border p-3 ${palette}`} data-testid={`dlr-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{label}</p>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-70">{sub}</p>}
    </div>
  );
}
