import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, CheckCircle2, AlertCircle, Banknote, Building2, CreditCard, FileText, Wallet, Search, Lock, Send, Plus, Trash2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const newLegId = () => `leg_${Math.random().toString(36).slice(2, 8)}`;

// Feb 28 2026 — 6 payment modes per user spec (mirrors IssueCashDialog).
const METHOD_OPTS = [
  { v: 'hdfc_savings',    label: 'HDFC Savings',    icon: CreditCard },
  { v: 'hdfc_current',    label: 'HDFC Current',    icon: Building2 },
  { v: 'direct_transfer', label: 'Cash D/T',        icon: Banknote },
  { v: 'cash',            label: 'Cash',            icon: Banknote },
  { v: 'cheque',          label: 'Cheque',          icon: FileText },
  { v: 'escrow',          label: 'Escrow',          icon: Wallet },
];

// Bank-like methods require a transaction reference but no denom/cheque list.
const isBankLike = (m) => m === 'hdfc_current' || m === 'hdfc_savings' || m === 'direct_transfer' || m === 'escrow' || m === 'current_account' || m === 'savings';

// One payment leg = method + amount + method-specific input fields
const makeLeg = (method = 'cheque') => ({
  id: newLegId(),
  method,
  amount: '',
  chequeIds: [],
  transactionId: '',
  denoms: {},
  // UI-only: cheque sub-tab + search
  chequeTab: 'active',
  search: '',
});

export default function PayApprovalDialog({ open, onOpenChange, reqType, requestId, onPaid }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [legs, setLegs] = useState([makeLeg('cheque')]);
  const [remarks, setRemarks] = useState('');
  const [requestingOpen, setRequestingOpen] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/approvals/${reqType}/${requestId}/pay-context`);
      setCtx(r.data);
      // Pre-fill the first leg amount with the net payable for convenience
      const payable = r.data?.payable_after_suspense || 0;
      setLegs([{ ...makeLeg('cheque'), amount: payable > 0 ? String(payable) : '' }]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load context');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !requestId) return;
    setCtx(null);
    setLegs([makeLeg('cheque')]);
    setRemarks('');
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestId, reqType]);

  const payable = ctx?.payable_after_suspense || 0;
  const billAmount = ctx?.request?.bill_amount || 0;
  const alreadyPaid = ctx?.request?.already_paid || 0;
  const isContinuation = !!ctx?.request?.is_continuation;

  // Cheque-id → cheque object map (across both lists)
  const allCheques = useMemo(() => {
    const m = {};
    [...(ctx?.active_cheques || []), ...(ctx?.inactive_cheques || [])].forEach(c => { m[c.cheque_id] = c; });
    return m;
  }, [ctx]);

  // Cheques already claimed by OTHER legs (so we don't double-select)
  const claimedByOtherLeg = (legId) => new Set(
    legs.filter(l => l.id !== legId && l.method === 'cheque').flatMap(l => l.chequeIds)
  );

  // Per-leg & total math
  const legMath = legs.map(l => {
    const chequeTotal = (l.chequeIds || []).reduce((s, cid) => s + Number(allCheques[cid]?.amount || 0), 0);
    const denomTotal = Object.entries(l.denoms || {}).reduce((s, [n, c]) => s + (Number(n) * Number(c || 0)), 0);
    const stated = Number(l.amount) || 0;
    return { id: l.id, chequeTotal, denomTotal, stated, isCheque: l.method === 'cheque' };
  });
  const totalLegAmount = legMath.reduce((s, m) => s + m.stated, 0);
  const remaining = payable - totalLegAmount;
  const isExact = Math.abs(remaining) < 0.5;
  const isUnder = remaining > 0.5;
  const isOver = remaining < -0.5;

  // Only cheque legs can produce excess (cash/bank must be exact)
  const nonChequeTotal = legMath.filter(m => !m.isCheque).reduce((s, m) => s + m.stated, 0);
  const nonChequeOverpaying = nonChequeTotal > payable + 0.5;

  // Update / Add / Remove legs
  const updateLeg = (legId, patch) => setLegs(prev => prev.map(l => l.id === legId ? { ...l, ...patch } : l));
  const addLeg = () => setLegs(prev => [...prev, makeLeg(prev.length === 0 ? 'cheque' : 'cash')]);
  const removeLeg = (legId) => setLegs(prev => prev.filter(l => l.id !== legId));

  const toggleChequeOnLeg = (legId, cid) => {
    const leg = legs.find(l => l.id === legId);
    const claimed = claimedByOtherLeg(legId);
    if (claimed.has(cid)) { toast.error('Cheque already selected in another leg'); return; }
    const current = leg.chequeIds || [];
    const next = current.includes(cid) ? current.filter(x => x !== cid) : [...current, cid];
    // Auto-update amount = sum of selected cheques (cheque legs must match face value)
    const newAmount = next.reduce((s, x) => s + Number(allCheques[x]?.amount || 0), 0);
    updateLeg(legId, { chequeIds: next, amount: newAmount > 0 ? String(newAmount) : '' });
  };

  const requestOpenCheque = async (cheque) => {
    if (cheque.open_requested) { toast.info('Already requested. CRE will open it.'); return; }
    setRequestingOpen(cheque.cheque_id);
    try {
      await axios.patch(`${API}/accountant/cheques/${cheque.cheque_id}/request-open`, { remarks: `Needed for ${reqType} payment` });
      toast.success(`Requested CRE to open ${cheque.cheque_number}`);
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to request');
    } finally {
      setRequestingOpen(null);
    }
  };

  const submit = async () => {
    // Suspense fully covers → no legs needed
    if (payable <= 0) {
      try {
        setSubmitting(true);
        const r = await axios.post(`${API}/approvals/${reqType}/${requestId}/pay`, { remarks: remarks || null });
        toast.success('Payment fully covered by vendor suspense.');
        onPaid && onPaid(r.data);
        onOpenChange(false);
      } catch (e) {
        toast.error(e?.response?.data?.detail || 'Payment failed');
      } finally { setSubmitting(false); }
      return;
    }

    // Validate each leg
    if (legs.length === 0) { toast.error('Add at least one payment leg'); return; }
    for (const l of legs) {
      const amt = Number(l.amount) || 0;
      if (amt <= 0) { toast.error(`Leg amount must be > 0 (${l.method})`); return; }
      if (l.method === 'cheque') {
        if (!l.chequeIds || l.chequeIds.length === 0) { toast.error('Cheque leg needs at least one cheque selected'); return; }
        const chTotal = l.chequeIds.reduce((s, cid) => s + Number(allCheques[cid]?.amount || 0), 0);
        if (Math.abs(chTotal - amt) > 0.5) { toast.error(`Cheque leg amount ${fmt(amt)} must match selected cheques total ${fmt(chTotal)}`); return; }
      } else if (isBankLike(l.method)) {
        // Transaction ID is optional — accountant may not have UTR/ref at
        // payment time; it can be back-filled later from Cheque Mgmt /
        // Cashbook drilldown. (Feb 28 2026 user request.)
      } else if (l.method === 'cash') {
        const denomTotal = Object.entries(l.denoms || {}).reduce((s, [n, c]) => s + (Number(n) * Number(c || 0)), 0);
        // Denominations are optional — if filled they must reconcile with
        // the leg amount, but an empty breakdown is allowed.
        if (denomTotal > 0 && Math.abs(denomTotal - amt) > 0.5) { toast.error(`Cash denominations ${fmt(denomTotal)} ≠ leg amount ${fmt(amt)}`); return; }
      }
    }
    if (nonChequeOverpaying) {
      toast.error(`Cash/bank legs total ${fmt(nonChequeTotal)} exceeds payable ${fmt(payable)} — only cheque excess can roll to suspense`);
      return;
    }

    const payload = {
      remarks: remarks || null,
      payment_legs: legs.map(l => ({
        method: l.method,
        amount: Number(l.amount),
        ...(l.method === 'cheque' ? { cheque_ids: l.chequeIds } : {}),
        ...(isBankLike(l.method) ? { transaction_id: l.transactionId } : {}),
        ...(l.method === 'cash' ? {
          denominations: Object.entries(l.denoms).filter(([, c]) => Number(c) > 0).map(([n, c]) => ({ note: Number(n), count: Number(c) }))
        } : {}),
      })),
    };

    try {
      setSubmitting(true);
      const r = await axios.post(`${API}/approvals/${reqType}/${requestId}/pay`, payload);
      if (r.data.is_partial) {
        toast.success(`Partial payment recorded: ${fmt(r.data.paid_amount)} paid · ${fmt(r.data.remaining_balance)} remaining`);
      } else {
        toast.success(`Payment processed: ${fmt(r.data.paid_amount)} paid${r.data.new_suspense_credit > 0 ? ` · ${fmt(r.data.new_suspense_credit)} → vendor suspense` : ''}`);
      }
      onPaid && onPaid(r.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" /> Pay & Settle — {reqType?.replace('_', ' ')}
            {isContinuation && (
              <Badge className="bg-yellow-100 text-yellow-800 text-[10px] ml-2">Continuation · Partially Paid</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !ctx ? (
          <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Request details */}
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-amber-700 uppercase mb-2">Request Details</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div><span className="text-gray-500 text-[11px]">Vendor</span><p className="font-medium">{ctx.request.vendor_name}</p></div>
                  <div><span className="text-gray-500 text-[11px]">Project</span><p className="font-medium">{ctx.request.project_name || '—'}</p></div>
                  <div><span className="text-gray-500 text-[11px]">Description</span><p className="font-medium truncate" title={ctx.request.description}>{ctx.request.description}</p></div>
                  <div><span className="text-gray-500 text-[11px]">Bill Amount</span><p className="font-bold text-amber-700">{fmt(billAmount)}</p></div>
                </div>
                {alreadyPaid > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between text-xs">
                    <span className="text-gray-600">Already paid in previous legs:</span>
                    <span className="font-bold text-emerald-700">{fmt(alreadyPaid)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live math summary */}
            <Card className={`${isExact ? 'bg-emerald-50 border-emerald-300' : isOver ? 'bg-blue-50 border-blue-300' : 'bg-amber-50 border-amber-300'} border-2`}>
              <CardContent className="p-3">
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div className="text-center bg-white rounded-md p-2">
                    <p className="text-[10px] text-gray-500 uppercase">Suspense Credit</p>
                    <p className="font-bold text-blue-700">−{fmt(ctx.suspense.credit_to_apply || 0)}</p>
                  </div>
                  <div className="text-center bg-white rounded-md p-2 ring-2 ring-orange-300">
                    <p className="text-[10px] text-gray-500 uppercase">Net Payable</p>
                    <p className="font-bold text-orange-700 text-base">{fmt(payable)}</p>
                  </div>
                  <div className="text-center bg-white rounded-md p-2">
                    <p className="text-[10px] text-gray-500 uppercase">Paid So Far</p>
                    <p className="font-bold text-emerald-700 text-base">{fmt(totalLegAmount)}</p>
                  </div>
                  <div className={`text-center rounded-md p-2 ring-2 ${isExact ? 'bg-emerald-100 ring-emerald-400' : isOver ? 'bg-blue-100 ring-blue-400' : 'bg-amber-100 ring-amber-400'}`}>
                    <p className="text-[10px] text-gray-500 uppercase">{isOver ? 'Excess → Suspense' : 'Remaining'}</p>
                    <p className={`font-bold text-base ${isExact ? 'text-emerald-700' : isOver ? 'text-blue-700' : 'text-amber-700'}`}>
                      {isExact ? '✓ ' + fmt(0) : isOver ? '+' + fmt(-remaining) : fmt(remaining)}
                    </p>
                  </div>
                </div>
                {isUnder && (
                  <p className="text-[11px] text-amber-700 mt-2 italic">
                    ⚠ Under-payment — request will be marked <strong>partially paid</strong> with balance {fmt(remaining)} pending.
                  </p>
                )}
                {isOver && (
                  <p className="text-[11px] text-blue-700 mt-2 italic">
                    Excess {fmt(-remaining)} will be credited to {ctx.request.vendor_name}'s suspense for future bills.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Multi-leg payment builder */}
            {payable > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-gray-700">Payment Legs · {legs.length}</Label>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-emerald-400 text-emerald-700" onClick={addLeg} data-testid="pay-add-leg">
                    <Plus className="h-3 w-3" /> Add Method
                  </Button>
                </div>
                {legs.map((leg, idx) => (
                  <LegEditor
                    key={leg.id}
                    leg={leg}
                    idx={idx}
                    canRemove={legs.length > 1}
                    ctx={ctx}
                    allCheques={allCheques}
                    claimedByOther={claimedByOtherLeg(leg.id)}
                    update={(patch) => updateLeg(leg.id, patch)}
                    remove={() => removeLeg(leg.id)}
                    toggleCheque={(cid) => toggleChequeOnLeg(leg.id, cid)}
                    requestOpenCheque={requestOpenCheque}
                    requestingOpen={requestingOpen}
                  />
                ))}
              </div>
            )}

            {/* Remarks */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Remarks (optional)</Label>
              <Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes about this payment..." data-testid="pay-remarks" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            className={`${isUnder ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            onClick={submit}
            disabled={submitting || !ctx || (payable > 0 && totalLegAmount <= 0)}
            data-testid="pay-submit-btn"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing…</>
              : <><CheckCircle2 className="h-4 w-4 mr-1" /> {isUnder ? 'Record Partial Payment' : 'Pay & Settle'}</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================== LegEditor (one payment leg) ===========================
function LegEditor({ leg, idx, canRemove, ctx, allCheques, claimedByOther, update, remove, toggleCheque, requestOpenCheque, requestingOpen }) {
  const denomTotal = Object.entries(leg.denoms || {}).reduce((s, [n, c]) => s + (Number(n) * Number(c || 0)), 0);
  const stated = Number(leg.amount) || 0;
  const visibleActive = (ctx.active_cheques || []).filter(c => {
    if (claimedByOther.has(c.cheque_id)) return false;
    if (!leg.search.trim()) return true;
    const q = leg.search.trim().toLowerCase();
    return (c.project_name || '').toLowerCase().includes(q)
        || (c.cheque_number || '').toLowerCase().includes(q)
        || (c.bank_name || '').toLowerCase().includes(q)
        || (c.party_name || '').toLowerCase().includes(q);
  });
  const visibleInactive = (ctx.inactive_cheques || []).filter(c => {
    if (!leg.search.trim()) return true;
    const q = leg.search.trim().toLowerCase();
    return (c.project_name || '').toLowerCase().includes(q)
        || (c.cheque_number || '').toLowerCase().includes(q)
        || (c.bank_name || '').toLowerCase().includes(q);
  });

  return (
    <Card className="border-l-4 border-l-emerald-400">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-600 text-white text-[10px]">Leg {idx + 1}</Badge>
          <Select value={leg.method} onValueChange={(v) => update({ method: v, chequeIds: [], transactionId: '', denoms: {}, amount: '' })}>
            <SelectTrigger className="h-8 text-xs w-44" data-testid={`leg-method-${idx}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTS.map(({ v, label, icon: Icon }) => (
                <SelectItem key={v} value={v}><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" /> {label}</div></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 flex-1">
            <Label className="text-xs text-gray-500">Amount</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={leg.amount}
              onChange={e => update({ amount: e.target.value })}
              disabled={leg.method === 'cheque'}
              className="h-8 text-xs w-36"
              data-testid={`leg-amount-${idx}`}
            />
            {leg.method === 'cheque' && <span className="text-[10px] text-gray-400 italic">auto = cheques total</span>}
          </div>
          {canRemove && (
            <Button size="sm" variant="ghost" className="h-7 text-red-600 hover:bg-red-50" onClick={remove} data-testid={`leg-remove-${idx}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Method-specific inputs */}
        {leg.method === 'cheque' && (
          <div className="border rounded-md overflow-hidden">
            <div className="flex bg-gray-50 border-b">
              <button type="button" className={`flex-1 px-3 py-1.5 text-xs font-medium ${leg.chequeTab === 'active' ? 'bg-white text-emerald-700 border-b-2 border-emerald-500' : 'text-gray-500'}`} onClick={() => update({ chequeTab: 'active' })}>
                <CheckCircle2 className="h-3 w-3 inline mr-1" /> Active ({visibleActive.length})
              </button>
              <button type="button" className={`flex-1 px-3 py-1.5 text-xs font-medium ${leg.chequeTab === 'inactive' ? 'bg-white text-amber-700 border-b-2 border-amber-500' : 'text-gray-500'}`} onClick={() => update({ chequeTab: 'inactive' })}>
                <Lock className="h-3 w-3 inline mr-1" /> Locked ({visibleInactive.length})
              </button>
            </div>
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <Input value={leg.search} onChange={e => update({ search: e.target.value })} placeholder="Search project / bank / cheque #" className="pl-7 h-7 text-xs" />
              </div>
            </div>
            <div className="max-h-56 overflow-auto">
              {leg.chequeTab === 'active' ? (
                visibleActive.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-xs"><AlertCircle className="h-5 w-5 mx-auto mb-1 text-amber-400" />No active cheques available</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="border-b text-gray-500">
                        <th className="text-left px-2 py-1.5">Project</th>
                        <th className="text-left px-2 py-1.5">Bank</th>
                        <th className="text-left px-2 py-1.5">Cheque #</th>
                        <th className="text-right px-2 py-1.5">Amount</th>
                        <th className="text-center px-2 py-1.5">Pick</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleActive.map(c => {
                        const sel = leg.chequeIds.includes(c.cheque_id);
                        return (
                          <tr key={c.cheque_id} onClick={() => toggleCheque(c.cheque_id)} className={`border-b cursor-pointer ${sel ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                            <td className="px-2 py-1.5">{c.project_name || '—'}</td>
                            <td className="px-2 py-1.5"><Badge className="bg-blue-100 text-blue-700 text-[9px]">{c.bank_name || '—'}</Badge></td>
                            <td className="px-2 py-1.5 font-mono">{c.cheque_number}</td>
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmt(c.amount)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={sel} onChange={() => toggleCheque(c.cheque_id)} onClick={e => e.stopPropagation()} className="h-3.5 w-3.5 accent-emerald-600" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              ) : (
                visibleInactive.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-xs">No locked cheques</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="border-b text-gray-500">
                        <th className="text-left px-2 py-1.5">Project</th>
                        <th className="text-left px-2 py-1.5">Bank</th>
                        <th className="text-left px-2 py-1.5">Cheque #</th>
                        <th className="text-right px-2 py-1.5">Amount</th>
                        <th className="text-center px-2 py-1.5">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInactive.map(c => (
                        <tr key={c.cheque_id} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-1.5">{c.project_name || '—'}</td>
                          <td className="px-2 py-1.5"><Badge className="bg-blue-100 text-blue-700 text-[9px]">{c.bank_name || '—'}</Badge></td>
                          <td className="px-2 py-1.5 font-mono">{c.cheque_number}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-gray-700">{fmt(c.amount)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {c.open_requested ? (
                              <Badge className="bg-blue-100 text-blue-700 text-[9px] gap-1"><Send className="h-2.5 w-2.5" /> Sent</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 border-amber-300 text-amber-700" disabled={requestingOpen === c.cheque_id} onClick={() => requestOpenCheque(c)}>
                                {requestingOpen === c.cheque_id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Req to Open'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        )}

        {isBankLike(leg.method) && (
          <div>
            <Label className="text-[11px] text-gray-600 mb-1 block">Transaction / UTR ID (optional)</Label>
            <Input value={leg.transactionId} onChange={e => update({ transactionId: e.target.value })} placeholder="e.g. UTR202604271234567" className="h-8 text-xs" data-testid={`leg-txn-${idx}`} />
          </div>
        )}

        {leg.method === 'cash' && (
          <div>
            <Label className="text-[11px] text-gray-600 mb-1 block">Denomination Breakdown *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {DENOMS.map(n => (
                <div key={n}>
                  <Label className="text-[9px] text-gray-500">₹{n}</Label>
                  <Input type="number" min="0" value={leg.denoms[n] || ''} onChange={e => update({ denoms: { ...leg.denoms, [n]: e.target.value } })} placeholder="0" className="h-7 text-[11px]" data-testid={`leg-${idx}-denom-${n}`} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between items-center text-[11px]">
              <span className="text-gray-500">Total Counted:</span>
              <span className={`font-bold ${Math.abs(denomTotal - stated) < 0.5 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(denomTotal)}{Math.abs(denomTotal - stated) > 0.5 && <span className="text-[10px] ml-2 text-red-500">(needs {fmt(stated)})</span>}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
