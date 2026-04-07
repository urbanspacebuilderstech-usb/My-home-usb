import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Users, Plus, Trash2, ClipboardList, IndianRupee, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const LABOUR_TYPES = [
  { value: 'skilled', label: 'Skilled' },
  { value: 'semi_skilled', label: 'Semi-Skilled' },
  { value: 'unskilled', label: 'Unskilled' },
];

const DAY_OPTIONS = [
  { value: 0.5, label: '1/2 Day (Half Salary)' },
  { value: 1, label: '1 Day (Full Salary)' },
  { value: 1.5, label: '1 1/2 Day (1.5x Salary)' },
];

const DLRPanel = ({ projectId, workOrderId, canRecord = false, onDlrChange }) => {
  const [dlrEntries, setDlrEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterDate, setFilterDate] = useState('');

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    entries: [{ type: 'skilled', count: '', day_value: 1, rate_per_day: '' }],
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

  const addRow = () => {
    setForm(f => ({ ...f, entries: [...f.entries, { type: 'unskilled', count: '', day_value: 1, rate_per_day: '' }] }));
  };

  const removeRow = (idx) => {
    setForm(f => ({ ...f, entries: f.entries.filter((_, i) => i !== idx) }));
  };

  const updateEntry = (idx, field, val) => {
    setForm(f => {
      const entries = [...f.entries];
      entries[idx] = { ...entries[idx], [field]: val };
      return { ...f, entries };
    });
  };

  const calcRowCost = (e) => (Number(e.count) || 0) * (Number(e.day_value) || 1) * (Number(e.rate_per_day) || 0);
  const totalCost = form.entries.reduce((s, e) => s + calcRowCost(e), 0);
  const totalWorkers = form.entries.reduce((s, e) => s + (Number(e.count) || 0), 0);

  const handleSubmit = async () => {
    const validEntries = form.entries.filter(e => Number(e.count) > 0 && Number(e.rate_per_day) > 0);
    if (!validEntries.length) { toast.error('Add at least one valid entry with count & rate'); return; }
    if (!form.date) { toast.error('Select a date'); return; }

    setSubmitting(true);
    try {
      await axios.post(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr`, {
        date: form.date,
        entries: validEntries.map(e => ({
          type: e.type,
          count: Number(e.count),
          day_value: Number(e.day_value),
          rate_per_day: Number(e.rate_per_day),
        })),
        notes: form.notes,
      });
      toast.success('DLR recorded successfully');
      setShowDialog(false);
      setForm({ date: new Date().toISOString().split('T')[0], entries: [{ type: 'skilled', count: '', day_value: 1, rate_per_day: '' }], notes: '' });
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

  return (
    <div className="space-y-3" data-testid="dlr-panel">
      {/* Header with filter and add button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold">Daily Labour Report ({dlrEntries.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="h-8 text-xs w-[140px]"
            data-testid="dlr-date-filter"
          />
          {filterDate && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterDate('')}>Clear</Button>
          )}
          {canRecord && (
            <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700" onClick={() => setShowDialog(true)} data-testid="dlr-add-btn">
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
                  <Badge variant="outline" className="text-[10px]">
                    <Users className="h-2.5 w-2.5 mr-0.5" />{dlr.total_workers} workers
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-teal-700">
                    <IndianRupee className="h-2.5 w-2.5 mr-0.5" />{fmt(dlr.total_cost)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    <Clock className="h-2.5 w-2.5 mr-0.5" />{dlr.total_day_units} day units
                  </Badge>
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
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Count</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Day</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Rate/Day</th>
                    <th className="px-3 py-1.5 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(dlr.entries || []).map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <Badge className={`text-[10px] ${getTypeColor(e.type)}`}>
                          {e.type === 'semi_skilled' ? 'Semi-Skilled' : e.type?.charAt(0).toUpperCase() + e.type?.slice(1)}
                        </Badge>
                      </td>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dlr-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-teal-600" />Record Daily Labour Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1"
                data-testid="dlr-form-date"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Labour Entries</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow} data-testid="dlr-add-row">
                  <Plus className="h-3 w-3 mr-1" />Add Type
                </Button>
              </div>

              {form.entries.map((entry, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2 bg-gray-50/50" data-testid={`dlr-row-${idx}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Entry {idx + 1}</span>
                    {form.entries.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeRow(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-500">Labour Type</Label>
                      <Select value={entry.type} onValueChange={v => updateEntry(idx, 'type', v)}>
                        <SelectTrigger className="h-8 text-xs mt-0.5" data-testid={`dlr-type-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LABOUR_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">No. of Workers</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 10"
                        value={entry.count}
                        onChange={e => updateEntry(idx, 'count', e.target.value)}
                        className="h-8 text-xs mt-0.5"
                        data-testid={`dlr-count-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">Day Type</Label>
                      <Select value={String(entry.day_value)} onValueChange={v => updateEntry(idx, 'day_value', Number(v))}>
                        <SelectTrigger className="h-8 text-xs mt-0.5" data-testid={`dlr-day-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_OPTIONS.map(d => (
                            <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-500">Rate / Day (INR)</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 800"
                        value={entry.rate_per_day}
                        onChange={e => updateEntry(idx, 'rate_per_day', e.target.value)}
                        className="h-8 text-xs mt-0.5"
                        data-testid={`dlr-rate-${idx}`}
                      />
                    </div>
                  </div>
                  {Number(entry.count) > 0 && Number(entry.rate_per_day) > 0 && (
                    <div className="text-right text-xs text-teal-700 font-semibold pt-1 border-t">
                      {entry.count} x {getDayLabel(entry.day_value)} x {fmt(entry.rate_per_day)} = {fmt(calcRowCost(entry))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="bg-teal-50 rounded-lg p-3 flex items-center justify-between" data-testid="dlr-form-total">
              <div className="text-xs">
                <span className="text-gray-600">Total Workers: </span>
                <span className="font-bold">{totalWorkers}</span>
              </div>
              <div className="text-sm font-bold text-teal-700">{fmt(totalCost)}</div>
            </div>

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any remarks for this day..."
                rows={2}
                className="mt-1 text-xs"
                data-testid="dlr-form-notes"
              />
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
