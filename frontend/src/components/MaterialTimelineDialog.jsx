import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Calendar, CheckCircle, FileText, XCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { buildTimeline } from './OrderDetailDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtFull = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const PlainAmount = ({ value, className = '' }) => <span className={className}>{fmtFull(value)}</span>;
const defaultModeLabel = (m) => (m || '').replace(/_/g, ' ').toUpperCase();
// Same set the backend treats as "this leg no longer pays the bill"
// (_PAID_LEG_EXCLUDED_STATUS in financial.py).
const UNPAID_LEG_STATUS = new Set(['rejected', 'accountant_rejected', 'accounts_rejected', 'under_correction', 'cheque_bounced']);

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

/**
 * Oct 22 2026 — Cashbook > Expense > eye icon on a material row. One list,
 * oldest first, of everything that happened to that material: the request's
 * own approval/delivery steps (buildTimeline, shared with OrderDetailDialog),
 * each bill Procurement sent to Accounts, and every payment leg against it
 * from GET /accountant/material-timeline/{expense_id}.
 *
 * `Amount` renders a money value; AccountsBoard passes its MaskedValue so an
 * Accountant sees the same masking as the Expense table.
 */
export default function MaterialTimelineDialog({ open, onClose, expenseId, Amount = PlainAmount, modeLabel = defaultModeLabel }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !expenseId) return undefined;
    let cancelled = false;
    setData(null);
    setError('');
    setLoading(true);
    axios.get(`${API}/accountant/material-timeline/${encodeURIComponent(expenseId)}`)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setError(err.response?.data?.detail || 'Failed to load the timeline'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, expenseId]);

  const req = data?.request;
  const bills = data?.bills || [];
  const payments = data?.payments || [];

  const events = [];
  if (req) {
    buildTimeline(req, { skipPaymentStamps: payments.length > 0 }).forEach(ev => events.push(ev));
    bills.forEach(b => {
      const phase = b.payment_phase && b.payment_phase !== 'full' ? `${b.payment_phase} ` : '';
      events.push({
        label: `Sent to Accounts for ${phase}payment`,
        amount: b.final_amount ?? b.amount ?? b.estimated_cost,
        by: 'Procurement',
        date: b.created_at,
        icon: FileText,
        color: 'text-indigo-600',
      });
    });
    payments.forEach(p => {
      const status = (p.status || '').toLowerCase();
      const unpaid = UNPAID_LEG_STATUS.has(status);
      const mode = modeLabel(p.payment_method || p.payment_mode);
      const ref = p.cheque_number ? `Cheque #${p.cheque_number}` : (p.transaction_id || p.reference || '');
      events.push({
        label: `Payment Released${p.payment_phase ? ` (${p.payment_phase})` : ''}`
          + (unpaid ? ` — ${status === 'cheque_bounced' ? 'bounced' : status.replace(/_/g, ' ')}` : ''),
        amount: p.amount,
        by: p.recorded_by_name || 'Accountant',
        detail: [ref.startsWith(mode) ? '' : mode, ref].filter(Boolean).join(' · '),
        date: p.payment_date || p.created_at,
        icon: unpaid ? XCircle : CheckCircle,
        color: unpaid ? 'text-red-600' : 'text-emerald-600',
        current: p.expense_id === expenseId,
        unpaid,
      });
      if (p.bounced_at) events.push({
        label: `Cheque bounced${p.bounce_reason ? `: "${p.bounce_reason}"` : ''}`,
        by: 'Accountant',
        date: p.bounced_at,
        icon: XCircle,
        color: 'text-red-600',
      });
    });
    events.sort((a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0));
  }

  const paid = payments
    .filter(p => !UNPAID_LEG_STATUS.has((p.status || '').toLowerCase()))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const orderValue = req ? (req.estimated_price || req.final_price || req.total_amount || 0) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-2xl max-h-[90dvh] sm:max-h-[90vh] overflow-y-auto p-0 rounded-xl sm:rounded-lg" data-testid="material-timeline-dialog">
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 sm:px-6 sm:py-4 pr-10">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="text-base sm:text-lg font-bold">{req?.material_name || 'Material Timeline'}</DialogTitle>
            <DialogDescription className="sr-only">Everything that happened to this material, oldest first</DialogDescription>
            {req && (
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                {req.request_number && <span className="font-mono">{req.request_number}</span>}
                {req.status && <Badge variant="outline" className="text-[10px] capitalize">{req.status.replace(/_/g, ' ')}</Badge>}
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="px-4 py-4 sm:px-6 space-y-4">
          {loading && <p className="text-center text-sm text-gray-400 py-8">Loading timeline…</p>}
          {error && <p className="text-center text-sm text-red-600 py-8" data-testid="material-timeline-error">{error}</p>}
          {req && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-gray-50 rounded-lg border p-3" data-testid="material-timeline-summary">
                <div><p className="text-gray-500">Project</p><p className="font-medium text-gray-900">{req.project_name || '—'}</p></div>
                <div><p className="text-gray-500">Vendor</p><p className="font-medium text-gray-900">{req.vendor_name || '—'}</p></div>
                <div><p className="text-gray-500">Quantity</p><p className="font-medium text-gray-900">{req.quantity ? `${Number(req.quantity).toLocaleString('en-IN')} ${req.unit || ''}` : '—'}</p></div>
                <div><p className="text-gray-500">Site Engineer</p><p className="font-medium text-gray-900">{req.site_engineer_name || '—'}</p></div>
                <div><p className="text-gray-500">Order Value</p><p className="font-semibold text-gray-900">{orderValue ? <Amount value={orderValue} /> : '—'}</p></div>
                {payments.length > 0 && (
                  <div><p className="text-gray-500">Paid so far</p><p className="font-semibold text-emerald-700"><Amount value={paid} className="text-emerald-700" /></p></div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-gray-600" /> Timeline
                </h3>
                {events.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 text-sm">No timeline events recorded yet.</p>
                ) : (
                  <div className="relative pl-6" data-testid="material-timeline">
                    <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
                    <div className="space-y-3">
                      {events.map((ev, idx) => {
                        const Icon = ev.icon;
                        return (
                          <div key={idx} className={`relative flex items-start gap-3 ${ev.current ? 'bg-amber-50 -mx-2 px-2 py-1 rounded-md' : ''}`}>
                            <div className={`absolute ${ev.current ? '-left-4' : '-left-6'} mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center bg-white border-2 ${idx === events.length - 1 ? 'border-orange-400' : 'border-gray-300'}`}>
                              <Icon className={`h-2.5 w-2.5 ${ev.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-medium ${ev.unpaid ? 'text-red-700' : 'text-gray-900'}`}>
                                  {ev.label}
                                  {ev.current && <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">This entry</Badge>}
                                </p>
                                {ev.amount != null && (
                                  <span className={`text-sm font-semibold whitespace-nowrap ${ev.unpaid ? 'text-red-600' : 'text-gray-900'}`}>
                                    <Amount value={ev.amount} />
                                  </span>
                                )}
                              </div>
                              {ev.detail && <p className="text-xs text-gray-600">{ev.detail}</p>}
                              <p className="text-xs text-gray-500">{ev.by} · {fmtDateTime(ev.date)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
