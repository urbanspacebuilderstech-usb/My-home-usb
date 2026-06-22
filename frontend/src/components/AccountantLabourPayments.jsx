import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote, CheckCircle, Send, Wallet, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import LabourRABReleaseDialog from './LabourRABReleaseDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

export default function AccountantLabourPayments() {
  const [tab, setTab] = useState('pending');
  const [projectFilter, setProjectFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/accountant/labour-payments?status=${tab}`);
      const raw = res.data?.requests || [];
      // Group multi-stage RAB siblings (same `rab_group_id`) into a single
      // row so the Accountant releases ONE bill (matches SE / PM / QC views).
      // The Release dialog uses the primary's request_id, and the linked
      // siblings show up below as a breakdown.
      const groups = new Map();
      const order = [];
      for (const r of raw) {
        const gid = r.rab_group_id || r.request_id;
        if (!groups.has(gid)) {
          order.push(gid);
          groups.set(gid, {
            ...r,
            is_multi_stage: false,
            stage_breakdown: [{
              stage_id: r.stage_id,
              stage_name: r.stage_name,
              request_id: r.request_id,
              amount: r.amount,
              work_order_id: r.work_order_id,
            }],
          });
        } else {
          const g = groups.get(gid);
          g.amount = (g.amount || 0) + (r.amount || 0);
          g.stage_breakdown.push({
            stage_id: r.stage_id,
            stage_name: r.stage_name,
            request_id: r.request_id,
            amount: r.amount,
            work_order_id: r.work_order_id,
          });
          g.is_multi_stage = g.stage_breakdown.length > 1;
          g.stage_name = g.stage_breakdown.map(s => s.stage_name).join(' + ');
        }
      }
      setItems(order.map(k => groups.get(k)));
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); /* eslint-disable-next-line */ }, [tab]);

  // Unique project list from the current fetch, for the project filter dropdown.
  const projectOptions = useMemo(() => {
    const seen = new Map();
    for (const it of items) {
      if (it.project_id && !seen.has(it.project_id)) {
        seen.set(it.project_id, it.project_name || '—');
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Reset project filter if the selected project disappears after a tab change.
  useEffect(() => {
    if (projectFilter !== 'all' && !projectOptions.some(p => p.id === projectFilter)) {
      setProjectFilter('all');
    }
  }, [projectOptions, projectFilter]);

  const visibleItems = useMemo(() => {
    if (projectFilter === 'all') return items;
    return items.filter(it => it.project_id === projectFilter);
  }, [items, projectFilter]);

  return (
    <div className="space-y-3" data-testid="accountant-labour-payments">
      <div className="flex items-end justify-between gap-2 flex-wrap border-b bg-white rounded-t-lg px-2 pt-1">
        <div className="flex gap-1">
          <button onClick={() => setTab('pending')}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${tab === 'pending' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid="alp-tab-pending">
            Pending Release {tab === 'pending' && visibleItems.length > 0 && <Badge variant="outline" className="ml-1.5 bg-amber-100 text-amber-700 border-amber-300 text-[10px]">{visibleItems.length}</Badge>}
          </button>
          <button onClick={() => setTab('released')}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${tab === 'released' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid="alp-tab-released">
            Released {tab === 'released' && visibleItems.length > 0 && <Badge variant="outline" className="ml-1.5 bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">{visibleItems.length}</Badge>}
          </button>
          <button onClick={() => setTab('all')}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${tab === 'all' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid="alp-tab-all">
            All {tab === 'all' && visibleItems.length > 0 && <Badge variant="outline" className="ml-1.5 bg-violet-100 text-violet-700 border-violet-300 text-[10px]">{visibleItems.length}</Badge>}
          </button>
        </div>
        <div className="pb-1.5 min-w-[180px]">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="alp-project-filter">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="alp-project-all">All Projects ({items.length})</SelectItem>
              {projectOptions.map(p => (
                <SelectItem key={p.id} value={p.id} data-testid={`alp-project-${p.id}`}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className="h-4 w-4 text-green-600" /> Labour Payment Releases · {visibleItems.length}
          </CardTitle>
          <CardDescription className="text-[11px]">Forwarded by Planning. Choose payment method, vendor & process release.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <p className="text-center text-xs text-gray-400 py-8">Loading...</p>
          : visibleItems.length === 0 ? <p className="text-center text-xs text-gray-400 py-10">No {tab === 'pending' ? 'pending' : tab === 'released' ? 'released' : ''} payments{projectFilter !== 'all' ? ' for this project' : ''}</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Contractor</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Project</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Stage</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Status</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Amount</th>
                    <th className="text-right px-3 py-2 font-semibold text-amber-700">Suspense</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleItems.map(r => (
                    <tr key={r.request_id} className="hover:bg-green-50/40" data-testid={`alp-row-${r.request_id}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{r.contractor_name}</p>
                        <p className="text-[10px] text-gray-500">{r.contractor_type}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{r.project_name}</p>
                        {r.rab_number && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 font-mono">{r.rab_number}</Badge>
                            {r.is_multi_stage && (
                              <Badge variant="outline" className="text-[9px] bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 font-semibold uppercase">
                                {r.stage_breakdown.length}-stage bill
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.is_multi_stage ? (
                          <div className="space-y-0.5">
                            {r.stage_breakdown.map((sb, i) => {
                              const isReleased = sb.status === 'approved';
                              return (
                                <div key={sb.request_id} className="flex items-center gap-1 text-[11px]">
                                  <span className="text-[9px] font-bold text-fuchsia-600 bg-fuchsia-50 rounded px-1">{i + 1}</span>
                                  <span className="truncate" title={sb.stage_name}>{sb.stage_name}</span>
                                  <Badge variant="outline" className={`text-[9px] ml-1 ${isReleased ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                    {isReleased ? 'Released' : 'Pending'}
                                  </Badge>
                                  <span className={`ml-auto font-semibold ${isReleased ? 'text-gray-400 line-through' : 'text-emerald-700'}`}>{fmt(sb.amount)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          r.stage_name
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'approved' ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Released</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-amber-700">{fmt(r.amount)}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-600">{fmt(r.suspense_balance)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setOpen(r)} data-testid={`alp-open-${r.request_id}`}>
                          {r.status === 'planning_approved' ? <><Send className="h-3 w-3" /> Release</> : <>View</>}
                        </Button>
                        {r.is_multi_stage && r.status === 'planning_approved' && (
                          <p className="text-[9px] text-fuchsia-600 mt-0.5 italic">single release · {r.stage_breakdown.length} stages</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <LabourRABReleaseDialog item={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); fetchItems(); }} />
    </div>
  );
}

// Legacy ReleaseDialog kept below for backward compat; no longer rendered.
function ReleaseDialog({ item, onClose, onDone }) {
  const [method, setMethod] = useState('savings_account');  // savings_account | current_account | cash | cheque
  const [chequeAmount, setChequeAmount] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [useSuspense, setUseSuspense] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setMethod('savings_account');
      setChequeAmount(String(item.amount || ''));
      setChequeNo(''); setBankRef('');
      setUseSuspense('');
      setNotes('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    }
  }, [item]);

  if (!item) return null;
  const isPending = item.status === 'planning_approved';
  const chequeExcess = method === 'cheque' && chequeAmount ? Math.max(0, parseFloat(chequeAmount || 0) - item.amount) : 0;

  const submit = async () => {
    if (method === 'cheque') {
      const ca = parseFloat(chequeAmount || 0);
      if (ca < item.amount) { toast.error('Cheque amount cannot be less than approved amount'); return; }
      if (!chequeNo.trim()) { toast.error('Cheque number is required'); return; }
    }
    if ((method === 'savings_account' || method === 'current_account') && !bankRef.trim()) { toast.error('Bank reference / UTR is required'); return; }
    const us = parseFloat(useSuspense || 0);
    if (us < 0) { toast.error('Suspense amount cannot be negative'); return; }
    if (us > item.suspense_balance + 0.01) { toast.error(`Cannot use more than available suspense (${fmt(item.suspense_balance)})`); return; }

    setSubmitting(true);
    try {
      await axios.post(`${API}/accountant/labour-payments/${item.request_id}/release`, {
        work_order_id: item.work_order_id,
        stage_id: item.stage_id,
        payment_method: method,
        cheque_amount: method === 'cheque' ? parseFloat(chequeAmount) : null,
        cheque_no: method === 'cheque' ? chequeNo : '',
        bank_ref: (method === 'savings_account' || method === 'current_account') ? bankRef : '',
        use_suspense_amount: us || 0,
        payment_date: paymentDate,
        notes,
      });
      toast.success('Payment released');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to release payment');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="alp-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">Release Payment</DialogTitle>
          <DialogDescription className="text-xs">{item.contractor_name} · {item.stage_name} · {item.project_name}</DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-amber-50 border border-amber-200 rounded p-2">
            <p className="text-amber-700">Approved Amount</p>
            <p className="font-bold text-amber-900 text-base">{fmt(item.amount)}</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded p-2">
            <p className="text-violet-700">Contractor Suspense</p>
            <p className="font-bold text-violet-900 text-base">{fmt(item.suspense_balance)}</p>
          </div>
        </div>
        {item.planning_amount_changed && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
            <p className="text-blue-800">SE requested {fmt(item.original_amount)}; Planning adjusted to {fmt(item.amount)}.</p>
            {item.planning_change_reason && <p className="text-blue-700 italic mt-0.5">"{item.planning_change_reason}"</p>}
          </div>
        )}

        {isPending ? (
          <>
            {/* Method selector */}
            <div>
              <Label className="text-xs">Payment Method</Label>
              <div className="flex gap-1 mt-1">
                {[
                  { k: 'savings_account', l: 'HDFC SAVINGS' },
                  { k: 'current_account', l: 'HDFC CURRENT' },
                  { k: 'cash', l: 'Cash' },
                  { k: 'cheque', l: 'Cheque' },
                ].map(m => (
                  <button
                    key={m.k}
                    onClick={() => setMethod(m.k)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors ${method === m.k ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    data-testid={`alp-method-${m.k}`}
                  >
                    {m.l}
                  </button>
                ))}
              </div>
            </div>

            {method === 'cheque' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cheque Amount</Label>
                    <Input type="number" value={chequeAmount} onChange={(e) => setChequeAmount(e.target.value)} className="mt-1 text-sm" data-testid="alp-cheque-amount" />
                  </div>
                  <div>
                    <Label className="text-xs">Cheque No.</Label>
                    <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className="mt-1 text-sm" data-testid="alp-cheque-no" />
                  </div>
                </div>
                {chequeExcess > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-amber-700" />
                    <span><span className="font-bold">{fmt(chequeExcess)}</span> excess will be credited to {item.contractor_name}'s Suspense Account</span>
                  </div>
                )}
              </>
            )}
            {(method === 'savings_account' || method === 'current_account') && (
              <div>
                <Label className="text-xs">Bank Reference / UTR</Label>
                <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} className="mt-1 text-sm" data-testid="alp-bank-ref" />
              </div>
            )}

            <div>
              <Label className="text-xs">Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 text-sm" data-testid="alp-date" />
            </div>

            {/* Use suspense */}
            {item.suspense_balance > 0 && (
              <div className="border-t pt-2">
                <Label className="text-xs flex items-center gap-1"><ArrowDownToLine className="h-3 w-3 text-violet-600" /> Apply from Suspense (max {fmt(item.suspense_balance)})</Label>
                <Input type="number" value={useSuspense} onChange={(e) => setUseSuspense(e.target.value)} placeholder="0 (optional)" className="mt-1 text-sm" data-testid="alp-use-suspense" />
              </div>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-sm" data-testid="alp-notes" />
            </div>
          </>
        ) : (
          <div className="space-y-2 text-xs">
            {item.payment_record ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-[10px] uppercase text-green-700 mb-1">Already Released</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p>Method: <span className="font-medium capitalize">{item.payment_record?.method}</span></p>
                    <p>Date: <span className="font-medium">{fmtDate(item.payment_record?.payment_date)}</span></p>
                    {item.payment_record?.cheque_no && <p>Cheque #: <span className="font-medium">{item.payment_record.cheque_no}</span></p>}
                    {item.payment_record?.bank_ref && <p>Bank Ref: <span className="font-medium">{item.payment_record.bank_ref}</span></p>}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-500">No payment record</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Close</Button>
          {isPending && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={submit} disabled={submitting} data-testid="alp-submit">
              <CheckCircle className="h-3 w-3 mr-1" /> {submitting ? 'Releasing...' : 'Process Release'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
