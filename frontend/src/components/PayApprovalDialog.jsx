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
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Loader2, CheckCircle2, AlertCircle, Banknote, Building2, CreditCard, FileText, Wallet, Search, Lock, Send } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function PayApprovalDialog({ open, onOpenChange, reqType, requestId, onPaid }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState('cheque');
  const [chequeIds, setChequeIds] = useState([]); // multi-select
  const [transactionId, setTransactionId] = useState('');
  const [denoms, setDenoms] = useState({});
  const [remarks, setRemarks] = useState('');
  // Cheque tabs (Active / Inactive)
  const [chequeTab, setChequeTab] = useState('active');
  const [projSearch, setProjSearch] = useState('');
  const [requestingOpen, setRequestingOpen] = useState(null); // cheque_id being requested

  const reload = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/approvals/${reqType}/${requestId}/pay-context`);
      setCtx(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load context');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !requestId) return;
    setCtx(null); setMethod('cheque'); setChequeIds([]); setTransactionId(''); setDenoms({}); setRemarks('');
    setChequeTab('active'); setProjSearch('');
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestId, reqType]);

  const denomTotal = Object.entries(denoms).reduce((s, [n, c]) => s + (Number(n) * Number(c || 0)), 0);
  const selectedCheques = (ctx?.active_cheques || []).filter(c => chequeIds.includes(c.cheque_id));
  const chequeTotal = selectedCheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const payable = ctx?.payable_after_suspense || 0;
  const newSuspense = method === 'cheque' ? Math.max(0, chequeTotal - payable) : 0;

  // Filter cheques by project search (matches project_name OR cheque_number OR bank_name)
  const matchSearch = (c) => {
    if (!projSearch.trim()) return true;
    const q = projSearch.trim().toLowerCase();
    return (c.project_name || '').toLowerCase().includes(q)
        || (c.cheque_number || '').toLowerCase().includes(q)
        || (c.bank_name || '').toLowerCase().includes(q)
        || (c.party_name || '').toLowerCase().includes(q);
  };
  const visibleActive = useMemo(() => (ctx?.active_cheques || []).filter(matchSearch), [ctx, projSearch]);
  const visibleInactive = useMemo(() => (ctx?.inactive_cheques || []).filter(matchSearch), [ctx, projSearch]);

  const toggleCheque = (cid) => {
    setChequeIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
  };

  const requestOpen = async (cheque) => {
    if (cheque.open_requested) {
      toast.info('Already requested. CRE will open it.');
      return;
    }
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
    if (method === 'cheque' && chequeIds.length === 0) {
      toast.error('Please select at least one cheque');
      return;
    }
    if (method === 'cheque' && chequeTotal < payable) {
      toast.error(`Cheque total ${fmt(chequeTotal)} is less than payable ${fmt(payable)}`);
      return;
    }
    if ((method === 'current_account' || method === 'savings') && !transactionId.trim()) {
      toast.error('Transaction ID is required');
      return;
    }
    if (method === 'cash' && Math.abs(denomTotal - payable) > 0.5) {
      toast.error(`Denominations total ${fmt(denomTotal)} ≠ payable ${fmt(payable)}`);
      return;
    }

    const body = {
      payment_method: method,
      remarks: remarks || null,
      ...(method === 'cheque' ? { cheque_ids: chequeIds } : {}),
      ...(method === 'current_account' || method === 'savings' ? { transaction_id: transactionId } : {}),
      ...(method === 'cash' ? {
        denominations: Object.entries(denoms).filter(([, c]) => Number(c) > 0).map(([n, c]) => ({ note: Number(n), count: Number(c) }))
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
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
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
                <div className="grid grid-cols-3 gap-3 text-sm">
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
                    <p className="font-bold text-orange-700 text-base">{fmt(payable)}</p>
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

            {/* === Cheque section: Active/Inactive tabs + search + multi-select === */}
            {method === 'cheque' && (
              <div className="border rounded-lg overflow-hidden">
                {/* Tab strip */}
                <div className="flex bg-gray-50 border-b">
                  <button
                    type="button"
                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${chequeTab === 'active' ? 'bg-white text-emerald-700 border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setChequeTab('active')}
                    data-testid="pay-tab-active"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Active Cheques
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{(ctx.active_cheques || []).length}</Badge>
                  </button>
                  <button
                    type="button"
                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${chequeTab === 'inactive' ? 'bg-white text-amber-700 border-b-2 border-amber-500' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setChequeTab('inactive')}
                    data-testid="pay-tab-inactive"
                  >
                    <Lock className="h-4 w-4" /> Inactive Cheques
                    <Badge className="bg-amber-100 text-amber-700 text-[10px]">{(ctx.inactive_cheques || []).length}</Badge>
                  </button>
                </div>

                {/* Search bar */}
                <div className="p-3 border-b bg-white">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Search by project / bank / cheque number…"
                      value={projSearch}
                      onChange={e => setProjSearch(e.target.value)}
                      className="pl-8 h-9 text-xs"
                      data-testid="pay-cheque-search"
                    />
                  </div>
                </div>

                {/* Cheque table */}
                {chequeTab === 'active' ? (
                  <div className="max-h-72 overflow-auto">
                    {visibleActive.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">
                        <AlertCircle className="h-6 w-6 mx-auto mb-1 text-amber-400" />
                        {ctx.active_cheques?.length === 0 ? 'No active CRE-opened cheques available' : 'No matching cheques'}
                      </div>
                    ) : (
                      <table className="w-full text-xs" data-testid="pay-active-cheque-table">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="border-b text-gray-500">
                            <th className="text-left px-3 py-2 font-semibold">Project</th>
                            <th className="text-left px-3 py-2 font-semibold">Bank</th>
                            <th className="text-left px-3 py-2 font-semibold">Cheque #</th>
                            <th className="text-right px-3 py-2 font-semibold">Amount</th>
                            <th className="text-center px-3 py-2 font-semibold">Select</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleActive.map(c => {
                            const sel = chequeIds.includes(c.cheque_id);
                            return (
                              <tr
                                key={c.cheque_id}
                                onClick={() => toggleCheque(c.cheque_id)}
                                className={`border-b cursor-pointer transition-colors ${sel ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                                data-testid={`pay-active-row-${c.cheque_id}`}
                              >
                                <td className="px-3 py-2">{c.project_name || '—'}</td>
                                <td className="px-3 py-2">
                                  <Badge className="bg-blue-100 text-blue-700 text-[10px]">{c.bank_name || '—'}</Badge>
                                  {c.is_post_dated && <Badge className="bg-purple-100 text-purple-700 text-[10px] ml-1">PDC</Badge>}
                                </td>
                                <td className="px-3 py-2 font-mono">{c.cheque_number}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(c.amount)}</td>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={sel}
                                    onChange={() => toggleCheque(c.cheque_id)}
                                    onClick={e => e.stopPropagation()}
                                    className="h-4 w-4 accent-emerald-600 cursor-pointer"
                                    data-testid={`pay-active-cb-${c.cheque_id}`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    {visibleInactive.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">
                        <AlertCircle className="h-6 w-6 mx-auto mb-1 text-amber-400" />
                        {ctx.inactive_cheques?.length === 0 ? 'No inactive cheques' : 'No matching cheques'}
                      </div>
                    ) : (
                      <table className="w-full text-xs" data-testid="pay-inactive-cheque-table">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="border-b text-gray-500">
                            <th className="text-left px-3 py-2 font-semibold">Project</th>
                            <th className="text-left px-3 py-2 font-semibold">Bank</th>
                            <th className="text-left px-3 py-2 font-semibold">Cheque #</th>
                            <th className="text-right px-3 py-2 font-semibold">Amount</th>
                            <th className="text-center px-3 py-2 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleInactive.map(c => (
                            <tr key={c.cheque_id} className="border-b hover:bg-gray-50" data-testid={`pay-inactive-row-${c.cheque_id}`}>
                              <td className="px-3 py-2">{c.project_name || '—'}</td>
                              <td className="px-3 py-2">
                                <Badge className="bg-blue-100 text-blue-700 text-[10px]">{c.bank_name || '—'}</Badge>
                                {c.is_post_dated && <Badge className="bg-purple-100 text-purple-700 text-[10px] ml-1">PDC</Badge>}
                              </td>
                              <td className="px-3 py-2 font-mono">{c.cheque_number}</td>
                              <td className="px-3 py-2 text-right font-bold text-gray-700">{fmt(c.amount)}</td>
                              <td className="px-3 py-2 text-center">
                                {c.open_requested ? (
                                  <Badge className="bg-blue-100 text-blue-700 text-[10px] gap-1">
                                    <Send className="h-3 w-3" /> Requested
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] gap-1 px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                                    disabled={requestingOpen === c.cheque_id}
                                    onClick={() => requestOpen(c)}
                                    data-testid={`pay-req-open-btn-${c.cheque_id}`}
                                  >
                                    {requestingOpen === c.cheque_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                    Req to Open
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Math preview when ≥1 active cheque selected */}
                {selectedCheques.length > 0 && (
                  <div className="bg-emerald-50 border-t border-emerald-200 p-3">
                    <p className="text-xs font-semibold text-emerald-700 uppercase mb-2">
                      Payment Math · {selectedCheques.length} cheque{selectedCheques.length > 1 ? 's' : ''} selected
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center bg-white rounded-md p-2">
                        <p className="text-[10px] text-gray-500 uppercase">Cheque Total</p>
                        <p className="font-bold text-emerald-700">{fmt(chequeTotal)}</p>
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
                  </div>
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
