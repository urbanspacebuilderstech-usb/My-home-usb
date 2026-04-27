import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Loader2, CheckCircle2, AlertCircle, Banknote, Building2, CreditCard, FileText, Wallet } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

/**
 * Pay an approval (material/labour/petty_cash).
 * Props:
 *   - open, onOpenChange — dialog state
 *   - reqType, requestId — which approval
 *   - onPaid — callback after success
 */
export default function PayApprovalDialog({ open, onOpenChange, reqType, requestId, onPaid }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState('cheque');
  const [chequeId, setChequeId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [denoms, setDenoms] = useState({}); // { 2000: 5, 500: 10 }
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!open || !requestId) return;
    setCtx(null); setMethod('cheque'); setChequeId(''); setTransactionId(''); setDenoms({}); setRemarks('');
    setLoading(true);
    axios.get(`${API}/approvals/${reqType}/${requestId}/pay-context`)
      .then(r => setCtx(r.data))
      .catch(e => toast.error(e?.response?.data?.detail || 'Failed to load context'))
      .finally(() => setLoading(false));
  }, [open, requestId, reqType]);

  const denomTotal = Object.entries(denoms).reduce((s, [n, c]) => s + (Number(n) * Number(c || 0)), 0);
  const selectedCheque = ctx?.active_cheques?.find(c => c.cheque_id === chequeId);
  const payable = ctx?.payable_after_suspense || 0;

  // What will actually be paid?
  let chequePaid = selectedCheque?.amount || 0;
  let newSuspense = 0;
  if (method === 'cheque' && selectedCheque) {
    newSuspense = Math.max(0, chequePaid - payable);
  }

  const submit = async () => {
    if (method === 'cheque' && !chequeId) {
      toast.error('Please choose a cheque');
      return;
    }
    if (method === 'cheque' && selectedCheque && selectedCheque.amount < payable) {
      toast.error(`Cheque amount ${fmt(selectedCheque.amount)} is less than payable ${fmt(payable)}`);
      return;
    }
    if ((method === 'current_account' || method === 'savings') && !transactionId.trim()) {
      toast.error('Transaction ID is required');
      return;
    }
    if (method === 'cash') {
      if (Math.abs(denomTotal - payable) > 0.5) {
        toast.error(`Denominations total ${fmt(denomTotal)} ≠ payable ${fmt(payable)}`);
        return;
      }
    }

    const body = {
      payment_method: method,
      remarks: remarks || null,
      ...(method === 'cheque' ? { cheque_id: chequeId } : {}),
      ...(method === 'current_account' || method === 'savings' ? { transaction_id: transactionId } : {}),
      ...(method === 'cash' ? {
        denominations: Object.entries(denoms).filter(([_, c]) => Number(c) > 0).map(([n, c]) => ({ note: Number(n), count: Number(c) }))
      } : {}),
    };

    try {
      setSubmitting(true);
      const r = await axios.post(`${API}/approvals/${reqType}/${requestId}/pay`, body);
      toast.success(`Payment processed: ${fmt(r.data.paid_amount)} paid${r.data.new_suspense_credit > 0 ? `, ${fmt(r.data.new_suspense_credit)} added to suspense` : ''}`);
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" /> Process Payment — {reqType?.replace('_', ' ')}
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Vendor</span><p className="font-medium">{ctx.request.vendor_name}</p></div>
                  <div><span className="text-gray-500">Project</span><p className="font-medium">{ctx.request.project_name || '—'}</p></div>
                  <div><span className="text-gray-500">Description</span><p className="font-medium">{ctx.request.description}</p></div>
                  <div><span className="text-gray-500">Bill Amount</span><p className="font-bold text-amber-700 text-lg">{fmt(ctx.request.bill_amount)}</p></div>
                </div>
              </CardContent>
            </Card>

            {/* Suspense breakdown */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Vendor Suspense Balance (auto-applied)</p>
                <div className="grid grid-cols-3 gap-3 text-sm" data-testid="pay-suspense-grid">
                  <div className="text-center bg-white rounded-md p-2">
                    <p className="text-[10px] text-gray-500 uppercase">Existing Balance</p>
                    <p className="font-bold text-blue-800">{fmt(ctx.suspense.vendor_balance)}</p>
                  </div>
                  <div className="text-center bg-white rounded-md p-2">
                    <p className="text-[10px] text-gray-500 uppercase">Credit Applied</p>
                    <p className="font-bold text-emerald-700">−{fmt(ctx.suspense.credit_to_apply)}</p>
                  </div>
                  <div className="text-center bg-white rounded-md p-2 ring-2 ring-orange-300">
                    <p className="text-[10px] text-gray-500 uppercase">Net Payable</p>
                    <p className="font-bold text-orange-700 text-base">{fmt(ctx.payable_after_suspense)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment method picker */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-2 block">Payment Method</Label>
              <RadioGroup value={method} onValueChange={setMethod} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { v: 'cheque', label: 'Cheque', icon: FileText },
                  { v: 'current_account', label: 'Current A/c', icon: Building2 },
                  { v: 'savings', label: 'Savings', icon: CreditCard },
                  { v: 'cash', label: 'Cash', icon: Banknote },
                ].map(({ v, label, icon: Icon }) => (
                  <label key={v} className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer ${method === v ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                    <RadioGroupItem value={v} id={`m-${v}`} data-testid={`pay-method-${v}`} />
                    <Icon className="h-3.5 w-3.5 text-gray-600" />
                    <span className="text-xs font-medium">{label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Method-specific inputs */}
            {method === 'cheque' && (
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-2 block">Choose CRE-Opened Cheque</Label>
                {ctx.active_cheques.length === 0 ? (
                  <Card><CardContent className="p-4 text-center text-sm text-gray-400">
                    <AlertCircle className="h-6 w-6 mx-auto mb-1 text-amber-400" />
                    No active CRE-opened cheques available
                  </CardContent></Card>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-auto" data-testid="pay-cheque-list">
                    {ctx.active_cheques.map(c => (
                      <button
                        key={c.cheque_id}
                        type="button"
                        onClick={() => setChequeId(c.cheque_id)}
                        className={`w-full text-left p-3 rounded-md border transition-all ${chequeId === c.cheque_id ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-200 hover:bg-gray-50'}`}
                        data-testid={`pay-cheque-opt-${c.cheque_id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm">{c.cheque_number}</span>
                              <Badge className="bg-blue-100 text-blue-700 text-[10px]">{c.bank_name}</Badge>
                              {c.is_post_dated && <Badge className="bg-purple-100 text-purple-700 text-[10px]">PDC</Badge>}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {c.party_name} · {c.project_name || 'No project'} · {new Date(c.cheque_date).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-700">{fmt(c.amount)}</p>
                            {chequeId === c.cheque_id && <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Cheque math preview */}
                {selectedCheque && (
                  <Card className="mt-3 bg-emerald-50 border-emerald-200">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-emerald-700 uppercase mb-2">Payment Math</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="text-center bg-white rounded-md p-2">
                          <p className="text-[10px] text-gray-500 uppercase">Cheque</p>
                          <p className="font-bold text-emerald-700">{fmt(chequePaid)}</p>
                        </div>
                        <div className="text-center bg-white rounded-md p-2">
                          <p className="text-[10px] text-gray-500 uppercase">Payable</p>
                          <p className="font-bold text-orange-700">−{fmt(payable)}</p>
                        </div>
                        <div className="text-center bg-white rounded-md p-2 ring-2 ring-blue-300">
                          <p className="text-[10px] text-gray-500 uppercase">New Suspense</p>
                          <p className={`font-bold text-base ${newSuspense > 0 ? 'text-blue-700' : 'text-gray-500'}`}>
                            {newSuspense > 0 ? '+' + fmt(newSuspense) : fmt(0)}
                          </p>
                        </div>
                      </div>
                      {newSuspense > 0 && (
                        <p className="text-[11px] text-blue-700 mt-2 italic">
                          Excess of {fmt(newSuspense)} will be credited to {ctx.request.vendor_name}'s suspense for future bills.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {(method === 'current_account' || method === 'savings') && (
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">Transaction / UTR ID *</Label>
                <Input
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  placeholder="e.g. UTR202604271234567"
                  data-testid="pay-txn-id"
                />
                <p className="text-[11px] text-gray-500 mt-1">Pay amount: <span className="font-bold text-orange-700">{fmt(payable)}</span></p>
              </div>
            )}

            {method === 'cash' && (
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-2 block">Denomination Breakdown *</Label>
                <Card>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {DENOMS.map(n => (
                        <div key={n}>
                          <Label className="text-[10px] text-gray-500">₹{n}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={denoms[n] || ''}
                            onChange={e => setDenoms({ ...denoms, [n]: e.target.value })}
                            placeholder="0"
                            className="h-8 text-xs"
                            data-testid={`pay-denom-${n}`}
                          />
                          <p className="text-[10px] text-gray-400 mt-0.5">{fmt((Number(denoms[n]) || 0) * n)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-between items-center pt-2 border-t">
                      <span className="text-xs text-gray-500">Total Counted:</span>
                      <span className={`font-bold text-base ${Math.abs(denomTotal - payable) < 0.5 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt(denomTotal)}
                        {Math.abs(denomTotal - payable) > 0.5 && <span className="text-[10px] ml-2 text-red-500">(should be {fmt(payable)})</span>}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Remarks */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Remarks (optional)</Label>
              <Textarea
                rows={2}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Any notes about this payment..."
                data-testid="pay-remarks"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={submit}
            disabled={submitting || !ctx}
            data-testid="pay-submit-btn"
          >
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing…</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Pay & Settle</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
