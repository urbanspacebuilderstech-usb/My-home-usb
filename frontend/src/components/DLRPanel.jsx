import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Calendar,
  Users,
  Trash2,
  ClipboardList,
  IndianRupee,
  Clock,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const DAY_OPTIONS = [
  { value: '0.5', label: '1/2 (Half)' },
  { value: '1', label: '1 (Full)' },
  { value: '1.5', label: '1 1/2 (OT)' },
];

const FIXED_ROWS = [
  { type: 'skilled', label: 'Skilled' },
  { type: 'semi_skilled', label: 'Semi-Skilled' },
  { type: 'unskilled', label: 'Unskilled' },
];

const DLRPanel = ({ projectId, workOrderId, labourRates, canRecord = false, onDlrChange }) => {
  const [dlrEntries, setDlrEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [projectStages, setProjectStages] = useState([]);

  const rates = labourRates || {};

  const initRows = () => FIXED_ROWS.map(r => ({
    type: r.type,
    count: '',
    day_value: '1',
    rate_per_day: rates[r.type] || 0,
  }));

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    rows: initRows(),
    notes: '',
    stage_id: '',
    work_summary: '',
  });

  const fetchDLR = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set('date_from', dateFrom);
      if (dateTo) qs.set('date_to', dateTo);
      const params = qs.toString() ? `?${qs.toString()}` : '';
      const res = await axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr${params}`);
      setDlrEntries(res.data || []);
    } catch { setDlrEntries([]); }
    setLoading(false);
  };

  useEffect(() => { if (projectId && workOrderId) fetchDLR(); }, [projectId, workOrderId, dateFrom, dateTo]);

  // Fetch the WO's payment-schedule stages and filter to ONLY currently-open
  // stages — those are the stages the SE is actively working on, so the DPR
  // dropdown should reflect that scoped list (not the entire project stage
  // hierarchy). Falls back to the project-level stages if the WO endpoint
  // is unavailable so the dropdown is never empty.
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        if (workOrderId) {
          const wr = await axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}`);
          // "Open" means is_open=true AND no payment_request currently in a
          // non-released approval state. If a RAB is awaiting PM/QC/Planning/
          // Accountant, the stage is functionally locked and must not appear
          // in the DLR stage picker — only stages an SE can actively work on.
          const PENDING_RAB = new Set(['requested', 'pm_approved', 'qc_approved', 'planning_approved']);
          const isStrictlyOpen = (s) => s.is_open === true && !(s.payment_requests || []).some(p => PENDING_RAB.has(p.status));
          const stages = (wr.data?.stages || []).filter(isStrictlyOpen).map((s, idx) => ({
            stage_id: s.stage_id,
            stage_name: s.name || s.stage_name || `Stage ${idx + 1}`,
            sl_no: s.sl_no || `S${idx + 1}`,
            is_section_header: false,
            is_addition: !!s.is_addition,
            claim_type: s.claim_type || (s.is_addition ? 'claimable' : null),
          }));
          if (stages.length > 0) { setProjectStages(stages); return; }
          // Contractor has NO open stages — leave empty so the picker tells
          // the SE to ask Planning to unlock one. No project-level fallback.
          setProjectStages([]);
          return;
        }
        const res = await axios.get(`${API}/projects/${projectId}/project-stages`);
        setProjectStages(Array.isArray(res.data) ? res.data : []);
      } catch { setProjectStages([]); }
    })();
  }, [projectId, workOrderId]);

  const openDialog = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      rows: initRows(),
      notes: '',
      stage_id: '',
      work_summary: '',
    });
    setShowDialog(true);
  };

  const updateRow = (idx, field, val) => {
    setForm(f => {
      const rows = [...f.rows];
      rows[idx] = { ...rows[idx], [field]: val };
      return { ...f, rows };
    });
  };

  const calcRowCost = (r) => (Number(r.count) || 0) * (Number(r.day_value) || 1) * (Number(r.rate_per_day) || 0);
  const totalCost = form.rows.reduce((s, r) => s + calcRowCost(r), 0);
  const totalWorkers = form.rows.reduce((s, r) => s + (Number(r.count) || 0), 0);

  const handleSubmit = async () => {
    const validEntries = form.rows.filter(r => Number(r.count) > 0);
    if (!validEntries.length) { toast.error('Enter worker count for at least one type'); return; }
    if (!form.date) { toast.error('Select a date'); return; }
    if (!form.stage_id) { toast.error('Select Current Project Stage'); return; }
    if (!form.work_summary?.trim()) { toast.error('Work Summary is required'); return; }

    // Check rates are set
    const missingRates = validEntries.filter(r => !Number(r.rate_per_day));
    if (missingRates.length) {
      toast.error(`Rate/Day not set for: ${missingRates.map(r => FIXED_ROWS.find(f => f.type === r.type)?.label).join(', ')}. Set rates in Work Order settings.`);
      return;
    }

    const selectedStage = projectStages.find(s => s.stage_id === form.stage_id);

    setSubmitting(true);
    try {
      await axios.post(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr`, {
        date: form.date,
        entries: validEntries.map(r => ({
          type: r.type,
          count: Number(r.count),
          day_value: Number(r.day_value),
          rate_per_day: Number(r.rate_per_day),
        })),
        notes: form.notes,
        stage_id: form.stage_id,
        stage_name: selectedStage?.stage_name || '',
        work_summary: form.work_summary.trim(),
      });
      toast.success('DLR & DPR recorded successfully');
      setShowDialog(false);
      fetchDLR();
      onDlrChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to record DLR');
    }
    setSubmitting(false);
  };

  const handleDelete = async (dlrId) => {
    if (!window.confirm('Delete this DLR entry?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr/${dlrId}`);
      toast.success('DLR deleted');
      fetchDLR();
      onDlrChange?.();
    } catch { toast.error('Failed to delete'); }
  };

  const getDayLabel = (v) => {
    if (v === 0.5) return '1/2';
    if (v === 1.5) return '1 1/2';
    return '1';
  };

  const getTypeColor = (t) => {
    if (t === 'skilled') return 'bg-blue-100 text-blue-800';
    if (t === 'semi_skilled') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-700';
  };

  const getTypeLabel = (t) => {
    if (t === 'semi_skilled') return 'Semi-Skilled';
    return t?.charAt(0).toUpperCase() + t?.slice(1);
  };

  return (
    <div className="space-y-3" data-testid="dlr-panel">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold">Daily Labour Report ({dlrEntries.length})</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">From</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-[140px]" data-testid="dlr-date-from" />
          <label className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">To</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs w-[140px]" data-testid="dlr-date-to" />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }} data-testid="dlr-date-clear">Clear</Button>
          )}
          {/* "+ Record DLR" button removed — DLR recording now happens
              via the Global DLR Report button on the Work Order list (one
              entry point keeps the SE workflow consistent). */}
        </div>
      </div>

      {/* DLR Entries List */}
      {loading ? (
        <p className="text-center text-gray-400 text-xs py-4">Loading...</p>
      ) : dlrEntries.length === 0 ? (
        <p className="text-center text-gray-400 text-xs py-6" data-testid="dlr-empty">
          No DLR entries{dateFrom || dateTo ? ` between ${dateFrom || '…'} → ${dateTo || '…'}` : ' recorded'}
        </p>
      ) : (
        <div className="space-y-2">
          {dlrEntries.map(dlr => (
            <div key={dlr.dlr_id} className="border rounded-lg overflow-hidden" data-testid={`dlr-entry-${dlr.dlr_id}`}>
              <div className="bg-teal-50 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-teal-600" />
                  <span className="text-xs font-semibold">{dlr.date}</span>
                  <Badge variant="outline" className="text-[10px]"><Users className="h-2.5 w-2.5 mr-0.5" />{dlr.total_workers} workers</Badge>
                  <Badge variant="outline" className="text-[10px] text-teal-700"><IndianRupee className="h-2.5 w-2.5 mr-0.5" />{fmt(dlr.total_cost)}</Badge>
                  <Badge variant="outline" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />{dlr.total_day_units} units</Badge>
                </div>
                {canRecord && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(dlr.dlr_id)} data-testid={`dlr-delete-${dlr.dlr_id}`}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Type</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Workers</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Day</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Rate/Day</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(dlr.entries || []).map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5"><Badge className={`text-[10px] ${getTypeColor(e.type)}`}>{getTypeLabel(e.type)}</Badge></td>
                      <td className="px-3 py-1.5 text-right font-medium">{e.count}</td>
                      <td className="px-3 py-1.5 text-right">{getDayLabel(e.day_value)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(e.rate_per_day)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmt(e.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-teal-50/50">
                  <tr>
                    <td className="px-3 py-1.5 font-bold">Total</td>
                    <td className="px-3 py-1.5 text-right font-bold">{dlr.total_workers}</td>
                    <td className="px-3 py-1.5 text-right font-bold">{dlr.total_day_units}</td>
                    <td className="px-3 py-1.5 text-right"></td>
                    <td className="px-3 py-1.5 text-right font-bold text-teal-700">{fmt(dlr.total_cost)}</td>
                  </tr>
                </tfoot>
              </table>
              {dlr.stage_name && (
                <div className="px-3 py-1.5 text-[11px] border-t bg-teal-50/40">
                  <span className="font-semibold text-teal-700">Stage:</span> <span className="text-gray-700">{dlr.stage_name}</span>
                </div>
              )}
              {dlr.work_summary && (
                <div className="px-3 py-1.5 text-[11px] text-gray-700 border-t bg-teal-50/20">
                  <span className="font-semibold text-teal-700">Work Summary:</span> {dlr.work_summary}
                </div>
              )}
              {dlr.notes && <p className="px-3 py-1.5 text-[11px] text-gray-500 border-t bg-gray-50">Note: {dlr.notes}</p>}
              {dlr.date_remark && (
                <p className="px-3 py-1.5 text-[11px] text-amber-800 border-t bg-amber-50" data-testid={`dlr-date-remark-${dlr.dlr_id}`}>
                  <span className="font-semibold">Back-dated DLR Remark:</span> {dlr.date_remark}
                </p>
              )}
              <p className="px-3 py-1 text-[10px] text-gray-400 border-t">By {dlr.created_by_name} at {new Date(dlr.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Record DLR Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="dlr-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-teal-600" />Record Daily Labour Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" data-testid="dlr-form-date" />
            </div>

            {/* Fixed 3-row table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 w-[120px]">Labour Type</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600 w-[90px]">No. of Workers</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600 w-[110px]">Day Type</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-[100px]">Rate / Day</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 w-[100px]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {form.rows.map((row, idx) => {
                    const rowTotal = calcRowCost(row);
                    const meta = FIXED_ROWS[idx];
                    const hasRate = Number(row.rate_per_day) > 0;
                    return (
                      <tr key={meta.type} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} data-testid={`dlr-row-${meta.type}`}>
                        <td className="px-3 py-2.5">
                          <Badge className={`text-[11px] font-medium ${getTypeColor(meta.type)}`}>{meta.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.count}
                            onChange={e => updateRow(idx, 'count', e.target.value)}
                            className="h-8 text-xs text-center"
                            data-testid={`dlr-count-${meta.type}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Select value={String(row.day_value)} onValueChange={v => updateRow(idx, 'day_value', v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`dlr-day-${meta.type}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAY_OPTIONS.map(d => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {hasRate ? (
                            <span className="text-xs font-medium text-gray-700">{fmt(row.rate_per_day)}</span>
                          ) : (
                            <span className="text-[10px] text-red-500">Not set</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs font-bold text-teal-700">{rowTotal > 0 ? fmt(rowTotal) : '-'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t bg-teal-50">
                  <tr>
                    <td className="px-3 py-2 font-bold text-xs">Total</td>
                    <td className="px-3 py-2 text-center font-bold text-xs">{totalWorkers || 0}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-bold text-sm text-teal-700" data-testid="dlr-form-total">{fmt(totalCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {!rates.skilled && !rates.semi_skilled && !rates.unskilled && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded px-3 py-2">
                Labour day rates are not set. Please edit this Work Order and set rates under "Labour Day Rates" to auto-fill here.
              </p>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any remarks for this day..." rows={2} className="mt-1 text-xs" data-testid="dlr-form-notes" />
            </div>

            {/* === Daily Progress Report (DPR) fields — now unified into DLR === */}
            <div className="border-t pt-3 mt-1 space-y-3 bg-teal-50/30 -mx-6 px-6 py-3">
              <p className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">Daily Progress Report (DPR)</p>

              <div>
                <Label className="text-xs">Current Project Stage <span className="text-red-500">*</span><span className="text-[10px] font-normal text-gray-500 ml-1">(open stages only)</span></Label>
                <Select value={form.stage_id} onValueChange={v => setForm(f => ({ ...f, stage_id: v }))}>
                  <SelectTrigger className="mt-1 h-9 text-xs" data-testid="dlr-form-stage">
                    <SelectValue placeholder={projectStages.length ? "Select an open stage..." : "No open stages for this contractor — ask Planning to unlock one"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const ADD_GROUPS = [
                        { key: 'claimable', label: 'Additional — Claimable From Client' },
                        { key: 'non_claimable', label: 'Additional — Non-Claimable From Client' },
                        { key: 'rework_se', label: 'Additional — Rework (Site Engineer)' },
                        { key: 'rework_client', label: 'Additional — Rework (Client)' },
                      ];
                      const items = projectStages.filter(s => !s.is_section_header);
                      const regular = items.filter(s => !s.is_addition);
                      const blocks = [];
                      if (regular.length > 0) {
                        blocks.push(<div key="hdr-regular" className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-50">Payment Schedule Stages</div>);
                        regular.forEach((s, idx) => {
                          const code = s.sl_no || `S${idx + 1}`;
                          blocks.push(<SelectItem key={s.stage_id} value={s.stage_id}>{code} {s.stage_name}</SelectItem>);
                        });
                      }
                      ADD_GROUPS.forEach(g => {
                        const groupItems = items.filter(s => {
                          if (!s.is_addition) return false;
                          const ct = s.claim_type || 'claimable';
                          if (g.key === 'rework_se') return ct === 'rework_se' || ct === 'rework';
                          return ct === g.key;
                        });
                        if (groupItems.length === 0) return;
                        blocks.push(<div key={`hdr-${g.key}`} className="px-2 py-1 text-[10px] uppercase tracking-wider text-violet-700 bg-violet-50 mt-1">{g.label}</div>);
                        groupItems.forEach((s, idx) => {
                          const code = s.sl_no || `A${idx + 1}`;
                          blocks.push(
                            <SelectItem key={s.stage_id} value={s.stage_id}>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700">ADD</span>
                                {code} {s.stage_name}
                              </span>
                            </SelectItem>
                          );
                        });
                      });
                      return blocks;
                    })()}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Work Summary <span className="text-red-500">*</span></Label>
                <Textarea
                  value={form.work_summary}
                  onChange={e => setForm(f => ({ ...f, work_summary: e.target.value }))}
                  placeholder="Describe work done today (e.g. Slab shuttering completed on 2nd floor, brick work continued at level 1...)"
                  rows={3}
                  className="mt-1 text-xs"
                  data-testid="dlr-form-work-summary"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleSubmit} disabled={submitting} data-testid="dlr-submit-btn">
              {submitting ? 'Saving...' : 'Save DLR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DLRPanel;
