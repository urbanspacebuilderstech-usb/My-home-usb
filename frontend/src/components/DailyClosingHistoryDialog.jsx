/**
 * Close Books — History dialog.
 *
 * Shows every day the Accountant has closed books, grouped by date, with
 * per-mode (Cash / HDFC Current / HDFC Savings / Cheque / Cash DT) computed
 * vs actual vs variance. Backed by GET /api/accountant/daily-closing/history
 * (already existed server-side; this is its first UI consumer).
 *
 * Props:
 *   open      bool
 *   onClose   fn()
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ChevronDown, ChevronUp, Loader2, CalendarDays, Undo2, AlertTriangle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODE_LABELS = {
  cash: 'Cash',
  current_account: 'HDFC Current',
  savings_account: 'HDFC Savings',
  cheque: 'Cheque',
  direct_transfer: 'Cash DT',
};
const MODE_ORDER = ['cash', 'current_account', 'savings_account', 'cheque', 'direct_transfer'];

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function DailyClosingHistoryDialog({ open, onClose, canReopen, onReopened }) {
  const [month, setMonth] = useState(currentMonth());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [reopenDialog, setReopenDialog] = useState({ open: false, closingId: null, label: '', reason: '', busy: false });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/accountant/daily-closing/history`, { params: { month } });
      setDays(Array.isArray(r.data?.days) ? r.data.days : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load closing history');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { if (open) fetchHistory(); }, [open, fetchHistory]);

  const submitReopen = async () => {
    if (!reopenDialog.reason.trim()) { toast.error('Reason is required'); return; }
    setReopenDialog(d => ({ ...d, busy: true }));
    try {
      await axios.patch(`${API}/accountant/daily-closing/${reopenDialog.closingId}/reopen`, { reason: reopenDialog.reason.trim() });
      toast.success('Row re-opened for correction');
      setReopenDialog({ open: false, closingId: null, label: '', reason: '', busy: false });
      fetchHistory();
      onReopened && onReopened();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to re-open');
      setReopenDialog(d => ({ ...d, busy: false }));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="close-books-history-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <CalendarDays className="h-5 w-5" /> Close Books — History
            </DialogTitle>
            <DialogDescription className="text-xs">
              Every day the books were closed, with actual vs computed balance per payment mode.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 mb-1">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 w-40 text-xs"
              data-testid="close-books-history-month"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-amber-600" /></div>
          ) : days.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400" data-testid="close-books-history-empty">No closings recorded for this month</div>
          ) : (
            <div className="space-y-2">
              {days.map(d => {
                const isOpen = expanded === d.date;
                const varColor = d.total_variance === 0 ? 'text-emerald-700' : d.total_variance > 0 ? 'text-blue-700' : 'text-red-700';
                return (
                  <div key={d.date} className="border rounded-lg overflow-hidden" data-testid={`close-books-day-${d.date}`}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : d.date)}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      data-testid={`close-books-day-toggle-${d.date}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                        <span className="font-semibold text-sm">{d.date}</span>
                        <span className="text-xs text-gray-500 truncate">Closed by {d.closed_by_name || '—'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-gray-500">Actual: <strong className="text-gray-800">{fmtInr(d.total_actual)}</strong></span>
                        <span className={`font-semibold ${varColor}`}>
                          {d.total_variance === 0 ? 'Matched' : `${d.total_variance > 0 ? 'Surplus' : 'Shortfall'} ${fmtInr(Math.abs(d.total_variance))}`}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-3 border-t overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-400 uppercase text-[10px]">
                              <th className="pb-1.5 pr-3">Mode</th>
                              <th className="pb-1.5 pr-3 text-right">Computed</th>
                              <th className="pb-1.5 pr-3 text-right">Actual</th>
                              <th className="pb-1.5 pr-3 text-right">Variance</th>
                              <th className="pb-1.5 pr-3">Remark</th>
                              <th className="pb-1.5 pr-3">Status</th>
                              {canReopen && <th className="pb-1.5"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {MODE_ORDER.filter(m => d.modes[m]).map(m => {
                              const row = d.modes[m];
                              const v = Number(row.variance || 0);
                              return (
                                <tr key={m} data-testid={`close-books-row-${d.date}-${m}`}>
                                  <td className="py-1.5 pr-3 font-medium">{MODE_LABELS[m] || m}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtInr(row.computed_balance)}</td>
                                  <td className="py-1.5 pr-3 text-right">{fmtInr(row.actual_balance)}</td>
                                  <td className={`py-1.5 pr-3 text-right font-semibold ${v === 0 ? 'text-emerald-700' : v > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                    {v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtInr(v)}`}
                                  </td>
                                  <td className="py-1.5 pr-3 text-gray-500 italic max-w-[160px] truncate" title={row.remark}>{row.remark || '-'}</td>
                                  <td className="py-1.5 pr-3">
                                    {row.reopened ? (
                                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 gap-1">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Re-opened
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Closed</Badge>
                                    )}
                                  </td>
                                  {canReopen && (
                                    <td className="py-1.5 text-right">
                                      {!row.reopened && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-[10px] text-amber-700 hover:bg-amber-50 gap-1"
                                          onClick={() => setReopenDialog({ open: true, closingId: row.closing_id, label: `${d.date} · ${MODE_LABELS[m] || m}`, reason: '', busy: false })}
                                          data-testid={`close-books-reopen-${d.date}-${m}`}
                                        >
                                          <Undo2 className="h-3 w-3" /> Re-open
                                        </Button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reopen confirmation — Super Admin only, reason required */}
      <Dialog open={reopenDialog.open} onOpenChange={(o) => !o && setReopenDialog({ open: false, closingId: null, label: '', reason: '', busy: false })}>
        <DialogContent className="max-w-md" data-testid="close-books-reopen-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Undo2 className="h-5 w-5" /> Re-open {reopenDialog.label}
            </DialogTitle>
            <DialogDescription className="text-xs">This lets the Accountant correct an already-closed row. Requires a reason for the audit trail.</DialogDescription>
          </DialogHeader>
          <Input
            value={reopenDialog.reason}
            onChange={(e) => setReopenDialog(d => ({ ...d, reason: e.target.value }))}
            placeholder="Reason for re-opening…"
            className="text-sm"
            data-testid="close-books-reopen-reason"
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setReopenDialog({ open: false, closingId: null, label: '', reason: '', busy: false })} disabled={reopenDialog.busy}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={submitReopen} disabled={reopenDialog.busy} data-testid="close-books-reopen-confirm">
              {reopenDialog.busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Undo2 className="h-3.5 w-3.5 mr-1" />}
              Re-open
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
