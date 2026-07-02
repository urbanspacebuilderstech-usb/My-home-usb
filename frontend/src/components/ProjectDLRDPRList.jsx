// Overall DLR & DPR submissions for a project (read-only list shown in SE DLR & DPR tab)
import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Calendar,
  Users,
  IndianRupee,
  ClipboardList,
  FileText,
  X,
  Eye,
  PlusCircle,
  Pencil,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const typeLabel = (t) => {
  if (t === 'semi_skilled') return 'Semi-Skilled';
  return t?.charAt(0).toUpperCase() + t?.slice(1);
};

const ProjectDLRDPRList = ({ projectId }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  // Date range filter — same UX as Pre-Sales board (presets + DayPicker)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Add / Edit DPR dialog state
  const [dprDialog, setDprDialog] = useState({ open: false, entry: null, summary: '', saving: false });
  // View DLR & DPR detail modal state
  const [viewEntry, setViewEntry] = useState(null);

  const fetchEntries = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.append('date_from', dateFrom);
      if (dateTo) qs.append('date_to', dateTo || dateFrom);
      const params = qs.toString() ? `?${qs.toString()}` : '';
      const res = await axios.get(`${API}/projects/${projectId}/dlr/summary${params}`);
      setEntries(res.data?.entries || []);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); /* eslint-disable-next-line */ }, [projectId, dateFrom, dateTo]);

  const openDprDialog = (entry) => {
    setDprDialog({ open: true, entry, summary: entry.work_summary || '', saving: false });
  };

  const saveDpr = async () => {
    const { entry, summary } = dprDialog;
    if (!entry || !summary.trim()) {
      toast.error('DPR Summary cannot be empty');
      return;
    }
    setDprDialog(d => ({ ...d, saving: true }));
    try {
      await axios.patch(
        `${API}/projects/${projectId}/work-orders/${entry.work_order_id}/dlr/${entry.dlr_id}/dpr`,
        { work_summary: summary.trim() }
      );
      toast.success('DPR Summary saved');
      setDprDialog({ open: false, entry: null, summary: '', saving: false });
      fetchEntries();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save DPR');
      setDprDialog(d => ({ ...d, saving: false }));
    }
  };

  const presets = [
    { label: 'Today', fn: () => { const d = new Date().toISOString().split('T')[0]; setDateFrom(d); setDateTo(''); } },
    { label: 'Yesterday', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().split('T')[0]; setDateFrom(s); setDateTo(''); } },
    { label: 'This Week', fn: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); setDateFrom(mon.toISOString().split('T')[0]); setDateTo(sun.toISOString().split('T')[0]); } },
    { label: 'Last 7 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 7); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
    { label: 'This Month', fn: () => { const now = new Date(); setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setDateTo(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]); } },
    { label: 'Last 30 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 30); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
    { label: 'Last 3 Months', fn: () => { const e = new Date(); const s = new Date(); s.setMonth(e.getMonth() - 3); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
    { label: 'Last 6 Months', fn: () => { const e = new Date(); const s = new Date(); s.setMonth(e.getMonth() - 6); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
    { label: 'This Year', fn: () => { const now = new Date(); setDateFrom(`${now.getFullYear()}-01-01`); setDateTo(`${now.getFullYear()}-12-31`); } },
    { label: 'Clear', fn: () => { setDateFrom(''); setDateTo(''); }, danger: true },
  ];

  return (
    <div className="rounded-xl border bg-white" data-testid="project-dlr-dpr-list">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 border-b bg-gray-50/60 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">DLR &amp; DPR Submissions ({entries.length})</span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`h-8 text-xs gap-1.5 rounded-lg shadow-sm ${dateFrom ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
              data-testid="dlr-dpr-date-filter-btn"
            >
              <Calendar className="h-3.5 w-3.5" />
              {dateFrom ? (
                dateTo && dateFrom !== dateTo
                  ? `${new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                  : new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              ) : 'Date'}
              {dateFrom && <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDateFrom(''); setDateTo(''); }} />}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-0" align="end">
            <div className="flex">
              <div className="w-32 border-r bg-gray-50 p-2 space-y-0.5 rounded-l-xl">
                {presets.map(p => (
                  <button
                    key={p.label}
                    onClick={p.fn}
                    className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${p.danger ? 'text-red-500 hover:bg-red-50 mt-2' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}
                    data-testid={`dlr-preset-${p.label.toLowerCase().replace(/ /g, '-')}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="p-3">
                {/* Explicit Start / End date inputs — fast entry for custom ranges */}
                <div className="flex items-end gap-2 mb-3" data-testid="dlr-custom-range">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-8 w-full border border-gray-200 rounded-lg px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      data-testid="dlr-date-start-input"
                    />
                  </div>
                  <span className="text-gray-400 text-xs pb-1.5">→</span>
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">End Date</label>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-8 w-full border border-gray-200 rounded-lg px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      data-testid="dlr-date-end-input"
                    />
                  </div>
                </div>
                <DayPicker
                  mode="range"
                  selected={dateFrom ? { from: new Date(dateFrom + 'T00:00:00'), to: dateTo ? new Date(dateTo + 'T00:00:00') : new Date(dateFrom + 'T00:00:00') } : undefined}
                  onSelect={(range) => {
                    if (range?.from) {
                      const from = range.from.toLocaleDateString('en-CA');
                      const to = range.to ? range.to.toLocaleDateString('en-CA') : '';
                      setDateFrom(from);
                      setDateTo(from === to ? '' : to);
                    } else {
                      setDateFrom('');
                      setDateTo('');
                    }
                  }}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Body */}
      {loading ? (
        <p className="text-center text-gray-400 text-xs py-6">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 px-4">
          <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No DLR &amp; DPR entries{dateFrom ? ` in this date range` : ' submitted yet'}</p>
          <p className="text-[11px] text-gray-400 mt-1">Open the Work Order tab and click <span className="font-semibold">+ DLR</span> to submit one.</p>
        </div>
      ) : (
        <div className="divide-y">
          {entries.map((e) => (
            <div key={e.dlr_id} className="px-3 sm:px-4 py-3" data-testid={`dlr-dpr-row-${e.dlr_id}`}>
              {/* Top row: date + contractor + workers + cost */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-teal-600" />
                  <span className="text-xs font-semibold text-gray-900">{e.date}</span>
                  <span className="text-[11px] text-gray-400">•</span>
                  <span className="text-xs text-gray-700">{e.contractor_name || '—'}</span>
                  {e.stage_name && (
                    <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">Stage: {e.stage_name}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    <Users className="h-2.5 w-2.5 mr-0.5" />{e.total_workers || 0} workers
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-teal-700">
                    <IndianRupee className="h-2.5 w-2.5 mr-0.5" />{fmt(e.total_cost)}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-50"
                    onClick={() => setViewEntry(e)}
                    title="View DLR & DPR report"
                    data-testid={`dlr-view-${e.dlr_id}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Labour split */}
              {Array.isArray(e.entries) && e.entries.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {e.entries.map((r, i) => (
                    <span key={i} className="text-[10px] bg-gray-50 border rounded px-1.5 py-0.5 text-gray-700">
                      {typeLabel(r.type)}: <span className="font-semibold">{r.count}</span> × {r.day_value} day
                    </span>
                  ))}
                </div>
              )}

              {/* Work Summary (DPR) — shown when present, else Add DPR CTA */}
              {e.work_summary ? (
                <div className="mt-1.5 flex items-start gap-2">
                  <p className="flex-1 text-[11px] text-gray-700 bg-emerald-50/40 border border-emerald-100 rounded px-2 py-1.5">
                    <span className="font-semibold text-emerald-700">Work Summary:</span> {e.work_summary}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px] gap-1 text-emerald-700 hover:bg-emerald-50 shrink-0"
                    onClick={() => openDprDialog(e)}
                    data-testid={`dlr-edit-dpr-${e.dlr_id}`}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[11px] gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => openDprDialog(e)}
                  data-testid={`dlr-add-dpr-${e.dlr_id}`}
                >
                  <PlusCircle className="h-3.5 w-3.5" /> Add DPR
                </Button>
              )}

              {/* Notes */}
              {e.notes && (
                <p className="mt-1 text-[11px] text-gray-500 italic">Note: {e.notes}</p>
              )}

              {/* Created by */}
              <p className="mt-1 text-[10px] text-gray-400">
                By {e.created_by_name || '—'} · {e.created_at ? new Date(e.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit DPR Summary Dialog */}
      <Dialog open={dprDialog.open} onOpenChange={(o) => { if (!o) setDprDialog({ open: false, entry: null, summary: '', saving: false }); }}>
        <DialogContent className="max-w-md" data-testid="dpr-summary-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-600" />
              {dprDialog.entry?.work_summary ? 'Edit DPR Summary' : 'Add DPR Summary'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {dprDialog.entry?.date} · {dprDialog.entry?.contractor_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">DPR Summary *</label>
            <Textarea
              value={dprDialog.summary}
              onChange={(e) => setDprDialog(d => ({ ...d, summary: e.target.value }))}
              placeholder="What work was done today? (e.g., Brick work completed on 2nd floor, centring work in progress...)"
              rows={5}
              className="text-sm"
              data-testid="dpr-summary-textarea"
            />
            <p className="text-[10px] text-gray-400">This will be visible to Planning and the client dashboard.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDprDialog({ open: false, entry: null, summary: '', saving: false })} disabled={dprDialog.saving}>Cancel</Button>
            <Button onClick={saveDpr} disabled={dprDialog.saving || !dprDialog.summary.trim()} className="bg-emerald-600 hover:bg-emerald-700" data-testid="dpr-save-btn">
              {dprDialog.saving ? 'Saving...' : 'Save DPR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Full DLR & DPR Report Dialog */}
      <Dialog open={!!viewEntry} onOpenChange={(o) => { if (!o) setViewEntry(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dlr-dpr-detail-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" /> DLR & DPR Report
            </DialogTitle>
            <DialogDescription className="text-xs">
              {viewEntry?.date} · {viewEntry?.contractor_name || '—'}
            </DialogDescription>
          </DialogHeader>
          {viewEntry && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-gray-500 uppercase">Total Workers</p>
                  <p className="text-sm font-bold text-gray-900">{viewEntry.total_workers || 0}</p>
                </div>
                <div className="bg-gray-50 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-gray-500 uppercase">Total Cost</p>
                  <p className="text-sm font-bold text-teal-700">{fmt(viewEntry.total_cost)}</p>
                </div>
              </div>
              {viewEntry.stage_name && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-indigo-500 uppercase">Current Stage</p>
                  <p className="text-xs font-semibold text-indigo-900">{viewEntry.stage_name}</p>
                </div>
              )}
              {Array.isArray(viewEntry.entries) && viewEntry.entries.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Labour Split</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium text-gray-600">Type</th>
                          <th className="text-right px-2 py-1 font-medium text-gray-600">Count</th>
                          <th className="text-right px-2 py-1 font-medium text-gray-600">Day</th>
                          <th className="text-right px-2 py-1 font-medium text-gray-600">Rate</th>
                          <th className="text-right px-2 py-1 font-medium text-gray-600">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {viewEntry.entries.map((r, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1">{typeLabel(r.type)}</td>
                            <td className="px-2 py-1 text-right">{r.count}</td>
                            <td className="px-2 py-1 text-right">{r.day_value}</td>
                            <td className="px-2 py-1 text-right">{fmt(r.rate_per_day)}</td>
                            <td className="px-2 py-1 text-right font-semibold text-teal-700">{fmt(r.total_cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">DPR — Work Summary</p>
                {viewEntry.work_summary ? (
                  <p className="text-xs text-gray-700 bg-emerald-50/40 border border-emerald-100 rounded px-2 py-1.5 whitespace-pre-wrap">{viewEntry.work_summary}</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">DPR not yet added.</p>
                )}
              </div>
              {viewEntry.notes && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Notes</p>
                  <p className="text-xs text-gray-700 bg-gray-50 border rounded px-2 py-1.5 whitespace-pre-wrap">{viewEntry.notes}</p>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t pt-2">
                Submitted by {viewEntry.created_by_name || '—'} · {viewEntry.created_at ? new Date(viewEntry.created_at).toLocaleString('en-IN') : ''}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectDLRDPRList;
