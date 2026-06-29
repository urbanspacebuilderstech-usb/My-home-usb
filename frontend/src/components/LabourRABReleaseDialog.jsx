// Accountant Release Payment dialog — used for both Labour RAB and Material releases.
// V3 (Feb 2026): supports multi-mode split payment. Accountant can pay one bill
// using multiple modes simultaneously (e.g. Cheque ₹10K + Cash ₹4.4K + HDFC ₹5K).
// Multiple cheque rows allowed. Cheque-row amount auto-sums from selected cheques.
//
// Backend (extended, backward-compatible):
//   - GET  /api/accountant/labour-rab/{request_id}/pay-context?work_order_id=&stage_id=
//   - POST /api/accountant/labour-payments/{request_id}/release
//     Body now accepts `payment_entries: [{ method, amount, bank_ref?, cheque_ids? }]`
//     in addition to the legacy single-method body.
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  PiggyBank, CheckCircle, Wallet, Hammer, FileText, Loader2,
} from 'lucide-react';
import MultiPaymentEntryRows from './MultiPaymentEntryRows';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

export default function LabourRABReleaseDialog({ item, onClose, onDone }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [useSuspense, setUseSuspense] = useState('0');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }
    const projectId = ctx?.project?.project_id;
    if (!projectId) { toast.error('Missing project_id'); return; }
    setRejecting(true);
    try {
      await axios.post(
        `${API}/projects/${projectId}/work-orders/${item.work_order_id}/stages/${item.stage_id}/payment-requests/${item.request_id}/accountant-reject`,
        { reason: rejectReason.trim() }
      );
      toast.success('RAB returned to Planning with your note');
      setShowReject(false); setRejectReason('');
      onDone && onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Reject failed');
    } finally { setRejecting(false); }
  };

  const reload = async () => {
    if (!item) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/accountant/labour-rab/${item.request_id}/pay-context`, {
        params: { work_order_id: item.work_order_id, stage_id: item.stage_id },
      });
      setCtx(res.data);
      const sus = res.data?.suspense?.credit_to_apply || 0;
      setUseSuspense(sus ? String(sus) : '0');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load bill detail');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (item) {
      setEntries([]); setNotes('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const approvedAmount = ctx?.request?.amount || 0;
  const suspenseBalance = ctx?.suspense?.vendor_balance || 0;
  const usedSuspense = Math.max(0, Math.min(parseFloat(useSuspense || 0) || 0, suspenseBalance));
  const payable = Math.max(0, approvedAmount - usedSuspense);

  const entriesSum = useMemo(
    () => entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [entries]
  );
  const entriesMatch = Math.abs(entriesSum - payable) < 0.5;
  const chequeExcess = useMemo(() => {
    // Sum of cheque amounts assigned to cheque rows minus the amount declared on those rows.
    // (Right now amount auto-syncs with selected cheques, so excess is 0 in normal use —
    // but kept here in case user manually lowers a cheque-row amount.)
    let excess = 0;
    entries.forEach((e) => {
      if (e.method !== 'cheque' || !e.cheque_ids?.length) return;
      const sumChq = (ctx?.active_cheques || [])
        .filter((c) => e.cheque_ids.includes(c.cheque_id))
        .reduce((s, c) => s + (Number(c.amount) || 0), 0);
      excess += Math.max(0, sumChq - (Number(e.amount) || 0));
    });
    return excess;
  }, [entries, ctx]);

  const submit = async () => {
    if (!ctx) return;
    // Feb 20 2026 — Allow empty payment_entries when the full bill is
    // covered by suspense (payable = 0). Otherwise still require at least
    // one method row.
    if (entries.length === 0 && payable > 0) { toast.error('Add at least one payment method'); return; }
    if (!entriesMatch) {
      toast.error(`Sum of entries (${fmt(entriesSum)}) must equal payable (${fmt(payable)})`); return;
    }
    for (const e of entries) {
      if ((e.method === 'current_account' || e.method === 'savings_account') && !(e.bank_ref || '').trim()) {
        toast.error(`Bank Reference/UTR is required for ${e.method === 'current_account' ? 'HDFC Current' : 'HDFC Savings'} row`); return;
      }
      if (e.method === 'cheque' && !(e.cheque_ids || []).length) {
        toast.error('Pick at least one cheque for every Cheque row'); return;
      }
      if (Number(e.amount) <= 0) { toast.error('Each row amount must be > 0'); return; }
    }
    if (usedSuspense > suspenseBalance + 0.01) {
      toast.error(`Cannot use more than available suspense (${fmt(suspenseBalance)})`); return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/accountant/labour-payments/${item.request_id}/release`, {
        work_order_id: item.work_order_id,
        stage_id: item.stage_id,
        // Multi-stage bills: pass every sibling so backend releases the whole
        // group atomically as ONE payment + ONE cashbook entry. Backend will
        // also auto-detect via rab_group_id if this list is missing.
        sibling_request_ids: (ctx?.request?.siblings || []).map(s => s.request_id),
        payment_entries: entries.map((e) => ({
          method: e.method,
          amount: Number(e.amount),
          bank_ref: e.bank_ref || '',
          cheque_ids: e.cheque_ids || [],
        })),
        use_suspense_amount: usedSuspense,
        payment_date: paymentDate,
        notes,
      });
      const stagesCount = (ctx?.request?.siblings || []).length;
      toast.success(
        ctx?.request?.is_multi_stage_bill
          ? `${stagesCount}-stage bill released as ONE payment of ${fmt(approvedAmount)}`
          : `Payment released across ${entries.length} method(s)${chequeExcess > 0 ? ` · ${fmt(chequeExcess)} → Suspense` : ''}`
      );
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to release payment');
    } finally { setSubmitting(false); }
  };

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-[96vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="rab-release-dialog-v3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <Wallet className="h-5 w-5" /> Release Payment
            {ctx?.request?.rab_number && (
              <Badge variant="outline" className="font-mono text-xs bg-amber-50 text-amber-700 border-amber-200">{ctx.request.rab_number}</Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {ctx?.work_order?.contractor_name || item.contractor_name} · {ctx?.stage?.stage_name || item.stage_name} · {ctx?.project?.project_name || item.project_name}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="ml-2 text-sm text-gray-500">Loading bill detail…</span>
          </div>
        )}

        {!loading && ctx && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Hammer className="h-3.5 w-3.5 text-amber-700" />
                  <span className="font-medium">{ctx.work_order.contractor_name}</span>
                  <Badge variant="outline" className="text-[10px] bg-white">{ctx.work_order.contractor_type || '—'}</Badge>
                </div>
                <span className="text-[10px] text-gray-500">Requested: {fmtDate(ctx.request.requested_at)} · by {ctx.request.requested_by_name}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white border rounded p-2">
                  <p className="text-[10px] text-gray-500 uppercase">Approved Amount</p>
                  <p className="text-base font-bold text-amber-700">{fmt(approvedAmount)}</p>
                </div>
                <div className="bg-white border rounded p-2">
                  <p className="text-[10px] text-gray-500 uppercase">Stage Total</p>
                  <p className="font-semibold text-gray-900">{fmt(ctx.stage.stage_total)}</p>
                </div>
                <div className="bg-white border rounded p-2">
                  <p className="text-[10px] text-gray-500 uppercase">Released So Far</p>
                  <p className="font-semibold text-green-700">{fmt(ctx.stage.released)}</p>
                </div>
                <div className="bg-white border rounded p-2">
                  <p className="text-[10px] text-gray-500 uppercase">Balance After This</p>
                  <p className="font-semibold text-blue-700">{fmt(ctx.stage.balance_after_this)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                {ctx.request.pm_approved_by_name && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">✓ PM: {ctx.request.pm_approved_by_name}</Badge>}
                {ctx.request.qc_approved_by_name && <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">✓ QC: {ctx.request.qc_approved_by_name}</Badge>}
                {ctx.request.planning_approved_by_name && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">✓ Planning: {ctx.request.planning_approved_by_name}</Badge>}
              </div>
              {ctx.request.is_multi_stage_bill && (
                <div className="bg-fuchsia-50 border border-fuchsia-200 rounded p-2 mt-1" data-testid="rab-rel-multi-stage-breakdown">
                  <p className="text-[10px] font-semibold text-fuchsia-700 uppercase mb-1">
                    {ctx.request.siblings.length}-Stage Bill · One Payment of {fmt(approvedAmount)}
                  </p>
                  <div className="space-y-0.5">
                    {ctx.request.siblings.map((s, i) => (
                      <div key={s.request_id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-[9px] font-bold text-fuchsia-600 bg-white border border-fuchsia-200 rounded px-1">{i + 1}</span>
                        <span className="flex-1 truncate text-gray-800" title={s.stage_name}>{s.stage_name}</span>
                        <span className="font-semibold text-emerald-700">{fmt(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-white border rounded p-2">
                <p className="text-[10px] font-semibold text-gray-700 uppercase flex items-center gap-1 mb-1.5">
                  <FileText className="h-3 w-3" /> Prior RABs on this WO ({ctx.prior_rabs.length})
                </p>
                {ctx.prior_rabs.length === 0 ? <p className="text-[11px] text-gray-400 italic">None</p> : (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {ctx.prior_rabs.map((p) => (
                      <div key={p.request_id} className="text-[11px] flex justify-between border-b last:border-0 py-0.5">
                        <span><span className="font-mono">{p.rab_number}</span> · {p.stage_name}</span>
                        <span><span className="font-semibold">{fmt(p.approved_amount || p.amount)}</span>
                          <Badge variant="outline" className={`ml-1 text-[9px] ${p.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{p.status === 'approved' ? 'paid' : p.status}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded p-2">
                <p className="text-[10px] font-semibold text-violet-700 uppercase flex items-center gap-1 mb-1.5">
                  <PiggyBank className="h-3 w-3" /> Contractor Suspense
                </p>
                <p className="text-base font-bold text-violet-800">{fmt(suspenseBalance)}</p>
                {suspenseBalance > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Label className="text-[10px] text-violet-700 shrink-0">Apply ₹</Label>
                    <Input type="number" min="0" max={Math.min(suspenseBalance, approvedAmount)} value={useSuspense} onChange={(e) => setUseSuspense(e.target.value)} className="h-6 text-[11px] py-0" data-testid="rab-rel-suspense-amount" />
                  </div>
                )}
              </div>
            </div>

            {/* Feb 28 2026 — Released RAB view: show payment_record as
                read-only summary instead of empty entry rows. */}
            {ctx.request?.status === 'approved' && ctx.request?.payment_record ? (
              <div className="border-2 border-emerald-200 rounded-md p-3 bg-emerald-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> Payment Released
                  </p>
                  <span className="text-[10px] text-gray-500">{fmtDate(ctx.request.payment_record.released_at || ctx.request.payment_record.payment_date)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Released by:</span>{' '}
                    <span className="font-medium">{ctx.request.payment_record.released_by_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total paid:</span>{' '}
                    <span className="font-semibold text-emerald-700">{fmt(ctx.request.approved_amount || ctx.request.amount)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-600 uppercase mb-1">Payment Method(s)</p>
                  {(() => {
                    const pr = ctx.request.payment_record;
                    const legs = pr.legs || pr.payment_entries || pr.payment_legs || [];
                    const rows = legs.length > 0 ? legs : [{
                      method: pr.method || pr.payment_method,
                      amount: pr.amount || ctx.request.approved_amount || ctx.request.amount,
                      bank_ref: pr.bank_ref || pr.transaction_id || pr.utr,
                      cheque_no: pr.cheque_no,
                    }];
                    const labelOf = (m) => ({
                      savings_account: 'HDFC SAVINGS', current_account: 'HDFC CURRENT',
                      direct_transfer: 'CASH D/T', cash: 'Cash', cheque: 'Cheque', escrow: 'Escrow',
                    }[m] || m || '—');
                    return rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-white border rounded px-2 py-1 mb-1 text-xs" data-testid={`rab-rel-paid-leg-${i}`}>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                          {labelOf(r.method)}
                        </Badge>
                        <span className="font-bold text-gray-800">{fmt(r.amount)}</span>
                        <span className="text-[10px] text-gray-500 truncate ml-2 flex-1 text-right">
                          {r.cheque_no ? `Cheque #${r.cheque_no}` : (r.bank_ref ? `UTR: ${r.bank_ref}` : '')}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
                {ctx.request.payment_record.notes && (
                  <p className="text-[11px] text-gray-600 italic">Notes: {ctx.request.payment_record.notes}</p>
                )}
              </div>
            ) : (
              <MultiPaymentEntryRows
                entries={entries}
                setEntries={setEntries}
                targetTotal={payable}
                availableCheques={ctx.active_cheques || []}
                inactiveCheques={ctx.inactive_cheques || []}
                onChequeOpenRequested={reload}
              />
            )}

            {ctx.request?.status !== 'approved' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Payment Date</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 h-8" data-testid="rab-rel-payment-date" />
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal remark" className="mt-1 h-8" data-testid="rab-rel-notes" />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {showReject ? (
            <div className="w-full flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1">
                <Label className="text-xs text-red-700">Rejection Reason *</Label>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why are you returning this RAB to Planning?"
                  className="mt-1 h-9 border-red-300 focus-visible:ring-red-400"
                  data-testid="rab-rel-reject-reason"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowReject(false); setRejectReason(''); }} disabled={rejecting} data-testid="rab-rel-reject-cancel">Cancel</Button>
                <Button variant="destructive" onClick={handleReject} disabled={rejecting || !rejectReason.trim()} data-testid="rab-rel-reject-submit">
                  {rejecting ? 'Rejecting…' : 'Confirm Reject'}
                </Button>
              </div>
            </div>
          ) : ctx?.request?.status === 'approved' ? (
            <Button variant="outline" onClick={onClose} disabled={submitting} data-testid="rab-rel-close-view">Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => setShowReject(true)}
                disabled={submitting || loading || !ctx}
                data-testid="rab-rel-reject"
              >
                Reject
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting || loading || !ctx || !entriesMatch || (entries.length === 0 && payable > 0)} data-testid="rab-rel-submit">
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                {submitting ? 'Releasing…' : 'Process Release'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
