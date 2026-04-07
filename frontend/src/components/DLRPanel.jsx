import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Users, Trash2, ClipboardList, IndianRupee, Clock, Plus } from 'lucide-react';
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
  const [filterDate, setFilterDate] = useState('');

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
  });

  const fetchDLR = async () => {
    setLoading(true);
    try {
      const params = filterDate ? `?date=${filterDate}` : '';
      const res = await axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr${params}`);
      setDlrEntries(res.data || []);
    } catch { setDlrEntries([]); }
    setLoading(false);
  };

  useEffect(() => { if (projectId && workOrderId) fetchDLR(); }, [projectId, workOrderId, filterDate]);

  const openDialog = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      rows: initRows(),
      notes: '',
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

    // Check rates are set
    const missingRates = validEntries.filter(r => !Number(r.rate_per_day));
    if (missingRates.length) {
      toast.error(`Rate/Day not set for: ${missingRates.map(r => FIXED_ROWS.find(f => f.type === r.type)?.label).join(', ')}. Set rates in Work Order settings.`);
      return;
    }

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
      });
      toast.success('DLR recorded successfully');
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
        <div className="flex items-center gap-2">
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="h-8 text-xs w-[140px]" data-testid="dlr-date-filter" />
          {filterDate && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterDate('')}>Clear</Button>}
          {canRecord && (
            <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700" onClick={openDialog} data-testid="dlr-add-btn">
              <Plus className="h-3 w-3 mr-1" />Record DLR
            </Button>
          )}
        </div>
      </div>

      {/* DLR Entries List */}
      {loading ? (
        <p className="text-center text-gray-400 text-xs py-4">Loading...</p>
      ) : dlrEntries.length === 0 ? (
        <p className="text-center text-gray-400 text-xs py-6" data-testid="dlr-empty">No DLR entries recorded{filterDate ? ` for ${filterDate}` : ''}</p>
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
              {dlr.notes && <p className="px-3 py-1.5 text-[11px] text-gray-500 border-t bg-gray-50">Note: {dlr.notes}</p>}
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
