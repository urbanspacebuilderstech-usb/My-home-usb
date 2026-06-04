/**
 * Super-Admin-only Payment Stage detail popup.
 *
 * Usage:
 *   const [dlg, setDlg] = useState({ open: false, stageId: null });
 *   <PaymentStageDetailDialog open={dlg.open} stageId={dlg.stageId}
 *      onClose={() => setDlg({ open: false, stageId: null })} />
 *
 * Calls GET /api/payment-stages/{stage_id}/detail and renders 5 tabs:
 *   Summary · Advance · Incomes · Cheques · Timeline
 *
 * Backend already enforces role=super_admin; this component is render-only.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDt = (v) => v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const cleanMode = (m) => (m || '—').toString().replace(/_/g, ' ');

export function PaymentStageDetailDialog({ open, stageId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('summary');

  useEffect(() => {
    if (!open || !stageId) return;
    setLoading(true); setData(null); setTab('summary');
    axios.get(`${API}/payment-stages/${stageId}/detail`)
      .then((r) => setData(r.data))
      .catch((e) => {
        toast.error(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to load stage details');
        onClose && onClose();
      })
      .finally(() => setLoading(false));
  }, [open, stageId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="stage-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-700">
            <Eye className="h-5 w-5" /> Payment Stage Details
          </DialogTitle>
          {data?.summary?.stage_name && (
            <DialogDescription className="text-xs">
              {data.summary.stage_label || ''} <span className="font-medium text-gray-700">{data.summary.stage_name}</span>
              {data?.project?.name && <> · <span className="text-violet-700">{data.project.name}</span></>}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading || !data ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
              {[
                { k: 'summary', label: 'Summary' },
                { k: 'advance', label: 'Advance', hidden: !data.advance },
                { k: 'incomes', label: `Incomes (${(data.incomes || []).length})` },
                { k: 'cheques', label: `Cheques (${(data.cheques || []).length})` },
                { k: 'timeline', label: `Timeline (${(data.timeline || []).length})` },
              ].filter(t => !t.hidden).map(t => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  data-testid={`stage-detail-tab-${t.k}`}
                >{t.label}</button>
              ))}
            </div>

            {tab === 'summary' && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                {Object.entries({
                  'Stage Name': data.summary.stage_name,
                  'Stage Label': data.summary.stage_label,
                  'Percentage': data.summary.percentage != null ? `${data.summary.percentage}%` : '—',
                  'Amount': fmtMoney(data.summary.amount),
                  'Received': fmtMoney(data.summary.amount_received),
                  'Balance': fmtMoney(data.summary.balance),
                  'Status': data.summary.status,
                  'Workflow': data.summary.workflow_status || '—',
                  'Expected Date': fmtDate(data.summary.expected_payment_date),
                  'Payment Mode': cleanMode(data.summary.payment_mode),
                  'Collected By': data.summary.collected_by_name || '—',
                  'Collected At': fmtDt(data.summary.collected_at),
                  'Fully Paid At': fmtDt(data.summary.paid_at),
                }).map(([k, v]) => (
                  <div key={k} className="rounded-md border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k}</p>
                    <p className="text-xs font-medium text-gray-800 truncate" title={String(v)}>{v || '—'}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === 'advance' && data.advance && (
              <div className="rounded-lg border bg-emerald-50/40 p-4 text-xs space-y-2">
                <p className="font-semibold text-emerald-800">Advance / Client Pre-payment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-gray-500">Amount</span><p className="font-semibold text-emerald-700">{fmtMoney(data.advance.amount)}</p></div>
                  <div><span className="text-gray-500">Payment Mode</span><p className="font-medium">{cleanMode(data.advance.payment_mode)}</p></div>
                  <div><span className="text-gray-500">Payment Date</span><p className="font-medium">{fmtDate(data.advance.payment_date)}</p></div>
                  <div><span className="text-gray-500">Collected By</span><p className="font-medium">{data.advance.collected_by_name || '—'}</p></div>
                </div>
              </div>
            )}

            {tab === 'incomes' && (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500">Date</th>
                      <th className="text-right px-3 py-2 text-gray-500">Amount</th>
                      <th className="text-left px-3 py-2 text-gray-500">Mode</th>
                      <th className="text-left px-3 py-2 text-gray-500">Reference</th>
                      <th className="text-left px-3 py-2 text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-gray-500">Collected By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.incomes || []).length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No income records yet</td></tr>
                    ) : data.incomes.map((inc) => (
                      <tr key={inc.income_id} className="border-t">
                        <td className="px-3 py-2">{fmtDate(inc.payment_date)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(inc.amount)}</td>
                        <td className="px-3 py-2">{cleanMode(inc.payment_mode)}</td>
                        <td className="px-3 py-2 text-gray-600">{inc.payment_reference || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] ${inc.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : inc.status === 'rejected' || inc.status === 'cheque_bounced' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{inc.status || '—'}</Badge>
                        </td>
                        <td className="px-3 py-2">{inc.collected_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'cheques' && (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500">Cheque #</th>
                      <th className="text-left px-3 py-2 text-gray-500">Bank</th>
                      <th className="text-right px-3 py-2 text-gray-500">Amount</th>
                      <th className="text-left px-3 py-2 text-gray-500">Cheque Date</th>
                      <th className="text-left px-3 py-2 text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.cheques || []).length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No cheque records</td></tr>
                    ) : data.cheques.map((c) => (
                      <tr key={c.cheque_id} className="border-t">
                        <td className="px-3 py-2 font-mono font-semibold">{c.cheque_number || '—'}</td>
                        <td className="px-3 py-2">{c.bank_name || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(c.amount)}</td>
                        <td className="px-3 py-2">{fmtDate(c.cheque_date)}</td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] ${c.status === 'bounced' ? 'bg-red-100 text-red-700' : c.status === 'cleared' || c.is_opened ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {c.status || '—'}{c.is_opened ? ' · opened' : ''}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'timeline' && (
              <div className="relative pl-5">
                <div className="absolute top-0 bottom-0 left-2 w-px bg-gray-200"></div>
                {(data.timeline || []).length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No timeline events recorded</p>
                ) : data.timeline.map((e, idx) => {
                  const dotCls = {
                    created: 'bg-gray-400',
                    requested: 'bg-blue-500',
                    cre_rejected: 'bg-red-500',
                    accountant_rejected: 'bg-red-500',
                    collected: 'bg-amber-500',
                    paid: 'bg-emerald-500',
                    income_approved: 'bg-emerald-500',
                    income_rejected: 'bg-red-500',
                    cheque_received: 'bg-indigo-500',
                    cheque_opened: 'bg-emerald-500',
                    cheque_bounced: 'bg-red-600',
                  }[e.kind] || 'bg-gray-400';
                  return (
                    <div key={idx} className="relative py-2 pl-4">
                      <span className={`absolute -left-0.5 top-3 h-3 w-3 rounded-full ring-2 ring-white ${dotCls}`}></span>
                      <p className="text-xs font-medium text-gray-800">{e.label}</p>
                      <p className="text-[10px] text-gray-500">
                        {fmtDt(e.at)}{e.by_name ? <> · by <span className="font-medium text-gray-700">{e.by_name}</span></> : null}
                      </p>
                      {e.meta?.reason && <p className="text-[10px] text-red-600 italic mt-0.5">Reason: {e.meta.reason}</p>}
                      {e.meta?.payment_mode && <p className="text-[10px] text-gray-600 mt-0.5">Mode: {cleanMode(e.meta.payment_mode)}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="stage-detail-close">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PaymentStageDetailDialog;
