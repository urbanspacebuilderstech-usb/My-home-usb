import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Banknote, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

export default function AccountantCreditSettlements() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payDialog, setPayDialog] = useState({ open: false, entry: null, method: 'bank', bank_ref: '', cheque_no: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/procurement-simple/credit-ledger?status=pending_accountant_approval`);
      setEntries(res.data?.entries || []);
    } catch {
      setEntries([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submitPay = async () => {
    if (!payDialog.entry) return;
    if (payDialog.method === 'bank' && !payDialog.bank_ref.trim()) { toast.error('Bank reference required'); return; }
    if (payDialog.method === 'cheque' && !payDialog.cheque_no.trim()) { toast.error('Cheque number required'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/procurement-simple/credit-ledger/${payDialog.entry.ledger_id}/settle`, {
        payment_method: payDialog.method,
        bank_ref: payDialog.bank_ref,
        cheque_no: payDialog.cheque_no,
        notes: payDialog.notes,
      });
      toast.success('Payment released — credit settled');
      setPayDialog({ open: false, entry: null, method: 'bank', bank_ref: '', cheque_no: '', notes: '' });
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to release payment');
    } finally { setSubmitting(false); }
  };

  return (
    <Card data-testid="accountant-credit-settlements">
      <CardHeader className="p-3 sm:p-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-purple-700">
          <Banknote className="h-4 w-4" /> Credit Settlements ({entries.length})
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={fetchAll}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-4 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No credit settlements awaiting payment</p>
        ) : (
          <div className="space-y-2" data-testid="credit-settlements-list">
            {entries.map(e => {
              const due = e.due_date ? new Date(e.due_date) : null;
              const daysLeft = due ? Math.round((due.getTime() - Date.now()) / 86400000) : null;
              const overdue = daysLeft !== null && daysLeft < 0;
              return (
                <div key={e.ledger_id} className="border rounded-md p-2.5 bg-purple-50/30 border-purple-200" data-testid={`credit-settlement-${e.ledger_id}`}>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-800 border-purple-300">Awaiting Payment</Badge>
                      {overdue && (
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">Overdue {Math.abs(daysLeft)}d</Badge>
                      )}
                      <span className="text-[10px] text-gray-500 font-mono">#{e.ledger_id}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">{fmt(e.amount)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Material</p><p className="font-medium truncate">{e.material_name}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Vendor</p><p className="font-medium truncate">{e.vendor_name}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Delivered</p><p className="font-medium">{fmtDate(e.delivered_at)}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Deadline</p><p className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{fmtDate(e.due_date)}</p></div>
                  </div>
                  {e.planning_approved_by_name && (
                    <p className="mt-1.5 text-[11px] text-gray-500">Approved by Planning: <strong>{e.planning_approved_by_name}</strong></p>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setPayDialog({ open: true, entry: e, method: 'bank', bank_ref: '', cheque_no: '', notes: '' })}
                      data-testid={`release-payment-btn-${e.ledger_id}`}
                    >
                      <Banknote className="h-3 w-3" /> Release Payment
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={payDialog.open} onOpenChange={(o) => !o && setPayDialog({ open: false, entry: null, method: 'bank', bank_ref: '', cheque_no: '', notes: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700"><Banknote className="h-5 w-5" /> Release Credit Payment</DialogTitle>
          </DialogHeader>
          {payDialog.entry && (
            <div className="space-y-3">
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs space-y-0.5">
                <p className="font-medium text-emerald-800">{payDialog.entry.material_name} — {payDialog.entry.vendor_name}</p>
                <p className="text-emerald-700 font-bold">{fmt(payDialog.entry.amount)}</p>
              </div>
              <div>
                <Label className="text-xs">Payment method *</Label>
                <Select value={payDialog.method} onValueChange={(v) => setPayDialog({ ...payDialog, method: v })}>
                  <SelectTrigger className="h-9 text-sm" data-testid="credit-pay-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="savings_account">Savings A/c</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {payDialog.method === 'bank' && (
                <div>
                  <Label className="text-xs">Bank reference / UTR *</Label>
                  <Input className="h-9 text-sm" value={payDialog.bank_ref} onChange={(e) => setPayDialog({ ...payDialog, bank_ref: e.target.value })} data-testid="credit-pay-bank-ref" />
                </div>
              )}
              {payDialog.method === 'cheque' && (
                <div>
                  <Label className="text-xs">Cheque number *</Label>
                  <Input className="h-9 text-sm" value={payDialog.cheque_no} onChange={(e) => setPayDialog({ ...payDialog, cheque_no: e.target.value })} data-testid="credit-pay-cheque-no" />
                </div>
              )}
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} className="text-sm" value={payDialog.notes} onChange={(e) => setPayDialog({ ...payDialog, notes: e.target.value })} data-testid="credit-pay-notes" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPayDialog({ open: false, entry: null, method: 'bank', bank_ref: '', cheque_no: '', notes: '' })} disabled={submitting}>Cancel</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={submitPay} disabled={submitting} data-testid="credit-pay-confirm">
              {submitting ? 'Releasing…' : 'Release & Record Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
