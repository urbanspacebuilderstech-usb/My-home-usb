// Accountant Release Payment dialog — used for both Labour RAB and Material releases.
// Mirrors income-side payment-method UI (HDFC SAVINGS / HDFC CURRENT / Cash / Cheque).
// For cheque mode, lets accountant pick from CRE-opened HDFC cheques (multi-select)
// and auto-credits any excess to the contractor/vendor suspense account.
//
// Backend:
//   - GET  /api/accountant/labour-rab/{request_id}/pay-context?work_order_id=&stage_id=
//   - POST /api/accountant/labour-payments/{request_id}/release
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Banknote, CreditCard, Building2, PiggyBank, Send, CheckCircle, Wallet,
  Hammer, FileText, Building, User as UserIcon, AlertTriangle, Search, Loader2, Lock,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

const METHOD_OPTIONS = [
  { value: 'cash',            label: 'Cash',         Icon: Banknote,    color: 'green'  },
  { value: 'cheque',          label: 'Cheque',       Icon: CreditCard,  color: 'blue'   },
  { value: 'current_account', label: 'HDFC CURRENT', Icon: Building2,   color: 'sky'    },
  { value: 'savings_account', label: 'HDFC SAVINGS', Icon: PiggyBank,   color: 'indigo' },
];

export default function LabourRABReleaseDialog({ item, onClose, onDone }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState('current_account');
  const [chequeIds, setChequeIds] = useState([]);
  const [chequeSearch, setChequeSearch] = useState('');
  const [chequeTab, setChequeTab] = useState('active'); // active | inactive
  const [bankRef, setBankRef] = useState('');
  const [useSuspense, setUseSuspense] = useState('0');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    if (!item) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/accountant/labour-rab/${item.request_id}/pay-context`, {
        params: { work_order_id: item.work_order_id, stage_id: item.stage_id },
      });
      setCtx(res.data);
      // Auto-suggest suspense usage
      const sus = res.data?.suspense?.credit_to_apply || 0;
      setUseSuspense(sus ? String(sus) : '0');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load bill detail');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (item) {
      setMethod('current_account'); setChequeIds([]); setBankRef(''); setNotes('');
      setPaymentDate(new Date().toISOString().split('T')[0]); setChequeTab('active'); setChequeSearch('');
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const matchSearch = (c) => {
    if (!chequeSearch.trim()) return true;
    const q = chequeSearch.trim().toLowerCase();
    return (c.cheque_number || '').toLowerCase().includes(q)
      || (c.bank_name || c.bank || '').toLowerCase().includes(q)
      || (c.party_name || '').toLowerCase().includes(q)
      || (c.project_name || '').toLowerCase().includes(q);
  };
  const visibleActive = useMemo(() => (ctx?.active_cheques || []).filter(matchSearch), [ctx, chequeSearch]);
  const visibleInactive = useMemo(() => (ctx?.inactive_cheques || []).filter(matchSearch), [ctx, chequeSearch]);
  const selectedCheques = useMemo(() => (ctx?.active_cheques || []).filter(c => chequeIds.includes(c.cheque_id)), [ctx, chequeIds]);
  const chequeTotal = selectedCheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const approvedAmount = ctx?.request?.amount || 0;
  const suspenseBalance = ctx?.suspense?.vendor_balance || 0;
  const usedSuspense = Math.max(0, Math.min(parseFloat(useSuspense || 0) || 0, suspenseBalance));
  const payable = Math.max(0, approvedAmount - usedSuspense);
  const chequeExcess = method === 'cheque' ? Math.max(0, chequeTotal - payable) : 0;

  const toggleCheque = (cid) => {
    setChequeIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
  };

  const requestOpenCheque = async (cheque) => {
    try {
      await axios.patch(`${API}/accountant/cheques/${cheque.cheque_id}/request-open`, {
        remarks: `Needed for RAB ${ctx?.request?.rab_number || ''} - ${ctx?.work_order?.contractor_name || ''}`,
      });
      toast.success(`Requested CRE to open ${cheque.cheque_number}`);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to request');
    }
  };

  const submit = async () => {
    if (!ctx) return;
    if (method === 'cheque' && chequeIds.length === 0) {
      toast.error('Please select at least one open cheque'); return;
    }
    if (method === 'cheque' && chequeTotal < payable) {
      toast.error(`Selected cheques ${fmt(chequeTotal)} < payable ${fmt(payable)}`); return;
    }
    if ((method === 'current_account' || method === 'savings_account') && !bankRef.trim()) {
      toast.error('Bank Reference / UTR is required'); return;
    }
    if (usedSuspense > suspenseBalance + 0.01) {
      toast.error(`Cannot use more than available suspense (${fmt(suspenseBalance)})`); return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/accountant/labour-payments/${item.request_id}/release`, {
        work_order_id: item.work_order_id,
        stage_id: item.stage_id,
        payment_method: method,
        cheque_ids: method === 'cheque' ? chequeIds : [],
        bank_ref: (method === 'current_account' || method === 'savings_account') ? bankRef : '',
        use_suspense_amount: usedSuspense,
        payment_date: paymentDate,
        notes,
      });
      toast.success(`Payment released${chequeExcess > 0 ? ` · ${fmt(chequeExcess)} moved to Suspense` : ''}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to release payment');
    } finally { setSubmitting(false); }
  };

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-[96vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="rab-release-dialog-v2">
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
            {/* === BILL DETAIL CARD === */}
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
              {/* Approval chain */}
              <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                {ctx.request.pm_approved_by_name && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    ✓ PM: {ctx.request.pm_approved_by_name}
                  </Badge>
                )}
                {ctx.request.qc_approved_by_name && (
                  <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                    ✓ QC: {ctx.request.qc_approved_by_name}
                  </Badge>
                )}
                {ctx.request.planning_approved_by_name && (
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                    ✓ Planning: {ctx.request.planning_approved_by_name}
                  </Badge>
                )}
              </div>
              {(ctx.request.notes || ctx.request.dlr_summary) && (
                <div className="text-[11px] text-gray-700 bg-white/60 rounded p-1.5 border italic">
                  {ctx.request.notes && <p>Note: "{ctx.request.notes}"</p>}
                  {ctx.request.dlr_summary && <p>DLR: {ctx.request.dlr_summary}</p>}
                </div>
              )}
            </div>

            {/* === PRIOR RABs + SUSPENSE === */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-white border rounded p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-gray-700 uppercase flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Prior RABs on this WO
                  </p>
                  <Badge variant="outline" className="text-[9px]">{ctx.prior_rabs.length}</Badge>
                </div>
                {ctx.prior_rabs.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">None</p>
                ) : (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {ctx.prior_rabs.map((p) => (
                      <div key={p.request_id} className="text-[11px] flex items-center justify-between gap-2 border-b last:border-0 py-0.5">
                        <span>
                          <span className="font-mono">{p.rab_number}</span> · {p.stage_name}
                        </span>
                        <span>
                          <span className="font-semibold">{fmt(p.approved_amount || p.amount)}</span>
                          {p.status === 'approved' ? (
                            <Badge variant="outline" className="ml-1 text-[9px] bg-green-50 text-green-700 border-green-200">paid</Badge>
                          ) : (
                            <Badge variant="outline" className="ml-1 text-[9px] bg-amber-50 text-amber-700 border-amber-200">{p.status}</Badge>
                          )}
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
                    <Input
                      type="number"
                      min="0"
                      max={Math.min(suspenseBalance, approvedAmount)}
                      value={useSuspense}
                      onChange={(e) => setUseSuspense(e.target.value)}
                      className="h-6 text-[11px] py-0"
                      data-testid="rab-rel-suspense-amount"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* === PAYMENT METHODS === */}
            <div>
              <Label className="text-xs font-semibold">Payment Method</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
                {METHOD_OPTIONS.map(({ value, label, Icon, color }) => {
                  const active = method === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setMethod(value)}
                      className={`flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-md border text-xs font-medium transition-all ${
                        active
                          ? `bg-${color}-600 text-white border-${color}-600 shadow-sm`
                          : `bg-white border-gray-200 hover:border-${color}-300 hover:bg-${color}-50`
                      }`}
                      data-testid={`rab-rel-method-${value}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* === Bank / Cheque inputs === */}
            {(method === 'current_account' || method === 'savings_account') && (
              <div>
                <Label className="text-xs">Bank Reference / UTR *</Label>
                <Input
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder="e.g. UTRNO123456"
                  className="mt-1"
                  data-testid="rab-rel-bank-ref"
                />
              </div>
            )}

            {method === 'cheque' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-xs flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Pick HDFC Cheque(s) *
                  </Label>
                  <div className="relative">
                    <Search className="h-3 w-3 text-gray-400 absolute left-2 top-2" />
                    <Input
                      placeholder="Search by cheque#/bank/party"
                      value={chequeSearch}
                      onChange={(e) => setChequeSearch(e.target.value)}
                      className="h-7 text-xs pl-7 w-56"
                      data-testid="rab-rel-cheque-search"
                    />
                  </div>
                </div>
                <div className="flex gap-1 border-b">
                  <button
                    onClick={() => setChequeTab('active')}
                    className={`px-2 py-1 text-[11px] font-medium border-b-2 ${chequeTab === 'active' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500'}`}
                    data-testid="rab-rel-cheque-tab-active"
                  >
                    Active ({visibleActive.length})
                  </button>
                  <button
                    onClick={() => setChequeTab('inactive')}
                    className={`px-2 py-1 text-[11px] font-medium border-b-2 ${chequeTab === 'inactive' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500'}`}
                    data-testid="rab-rel-cheque-tab-inactive"
                  >
                    Locked ({visibleInactive.length})
                  </button>
                </div>
                {chequeTab === 'active' && (
                  <div className="border rounded max-h-44 overflow-y-auto">
                    {visibleActive.length === 0 ? (
                      <p className="text-center text-[11px] text-gray-400 py-4">No open HDFC cheques available</p>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="p-1.5 w-6"></th>
                            <th className="text-left p-1.5">Cheque #</th>
                            <th className="text-left p-1.5">Bank</th>
                            <th className="text-left p-1.5">Project / Party</th>
                            <th className="text-right p-1.5">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleActive.map((c) => {
                            const sel = chequeIds.includes(c.cheque_id);
                            return (
                              <tr
                                key={c.cheque_id}
                                onClick={() => toggleCheque(c.cheque_id)}
                                className={`border-b cursor-pointer hover:bg-emerald-50/40 ${sel ? 'bg-emerald-100/50' : ''}`}
                                data-testid={`rab-rel-cheque-row-${c.cheque_id}`}
                              >
                                <td className="p-1.5 text-center">
                                  <input type="checkbox" checked={sel} onChange={() => toggleCheque(c.cheque_id)} className="accent-emerald-600" data-testid={`rab-rel-cheque-cb-${c.cheque_id}`} />
                                </td>
                                <td className="p-1.5 font-mono">{c.cheque_number}</td>
                                <td className="p-1.5">{c.bank_name || c.bank || '—'}</td>
                                <td className="p-1.5 text-gray-600">{c.project_name || c.party_name || '—'}</td>
                                <td className="p-1.5 text-right font-semibold">{fmt(c.amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {chequeTab === 'inactive' && (
                  <div className="border rounded max-h-44 overflow-y-auto">
                    {visibleInactive.length === 0 ? (
                      <p className="text-center text-[11px] text-gray-400 py-4">No locked HDFC cheques</p>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left p-1.5">Cheque #</th>
                            <th className="text-left p-1.5">Bank</th>
                            <th className="text-right p-1.5">Amount</th>
                            <th className="text-right p-1.5">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleInactive.map((c) => (
                            <tr key={c.cheque_id} className="border-b">
                              <td className="p-1.5 font-mono"><Lock className="inline h-2.5 w-2.5 mr-1 text-gray-400" />{c.cheque_number}</td>
                              <td className="p-1.5">{c.bank_name || c.bank || '—'}</td>
                              <td className="p-1.5 text-right">{fmt(c.amount)}</td>
                              <td className="p-1.5 text-right">
                                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => requestOpenCheque(c)} disabled={c.open_requested} data-testid={`rab-rel-cheque-req-open-${c.cheque_id}`}>
                                  <Send className="h-2.5 w-2.5" />
                                  {c.open_requested ? 'Requested' : 'Request Open'}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {/* Cheque math + excess preview */}
                {chequeIds.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between"><span>Selected {chequeIds.length} cheque(s)</span><span className="font-semibold">{fmt(chequeTotal)}</span></div>
                    <div className="flex justify-between"><span>Payable</span><span className="font-semibold">{fmt(payable)}</span></div>
                    {chequeExcess > 0 && (
                      <div className="flex justify-between text-violet-700 border-t pt-1 mt-1">
                        <span className="flex items-center gap-1"><PiggyBank className="h-3 w-3" /> → Suspense</span>
                        <span className="font-bold">+{fmt(chequeExcess)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* === Common: date + notes === */}
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting || loading || !ctx} data-testid="rab-rel-submit">
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            {submitting ? 'Releasing…' : 'Process Release'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
