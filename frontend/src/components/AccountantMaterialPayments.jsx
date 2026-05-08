import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Wallet, Banknote, Building2, FileSignature, Send, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

/**
 * Accountant queue for material payments coming from the new Procurement flow.
 * Shows requests with status:
 *   - pending_accounts_approval  (full or advance phase, depending on payment_mode)
 *   - pending_balance_payment    (balance leg after SE confirms delivery for advance mode)
 *
 * Releases via POST /procurement-simple/material-requests/{id}/release-payment
 */
export default function AccountantMaterialPayments({ onRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/procurement-simple/accountant/queue`);
      setItems(r.data?.requests || []);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  if (loading) return <p className="text-center text-xs text-gray-400 py-6">Loading material payments…</p>;
  if (items.length === 0) return <p className="text-center text-xs text-gray-400 py-6">No pending material payments</p>;

  return (
    <>
      <div className="space-y-2" data-testid="acc-material-payments">
        {items.map(req => {
          const phase = req.next_payment_phase || 'full';
          const total = req.total_amount || req.estimated_price || 0;
          const paid = req.paid_amount || 0;
          const due = phase === 'balance' ? Math.max(0, total - paid) : (phase === 'advance' ? (req.advance_amount || 0) : total);
          const phaseColor = phase === 'advance' ? 'orange' : phase === 'balance' ? 'cyan' : 'blue';
          return (
            <Card key={req.request_id} className="hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: phaseColor === 'orange' ? '#ea580c' : phaseColor === 'cyan' ? '#0891b2' : '#2563eb' }}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] capitalize bg-${phaseColor}-50 text-${phaseColor}-700 border-${phaseColor}-200`}>
                      {phase} payment
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{(req.payment_mode || '').replace(/_/g, ' ')}</Badge>
                    {req.order_id && <span className="text-[10px] text-gray-400 font-mono">#{req.order_id}</span>}
                  </div>
                  <span className="text-base font-bold text-emerald-700">{fmt(due)}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Material</p>
                    <p className="font-medium truncate">{req.material_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Vendor</p>
                    <p className="font-medium truncate">{req.vendor_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Project</p>
                    <p className="font-medium truncate">{req.project_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Total / Paid</p>
                    <p className="font-medium">{fmt(total)} / {fmt(paid)}</p>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(req)} data-testid={`acc-mat-release-${req.request_id}`}>
                    <Wallet className="h-3 w-3" /> Release {phase === 'balance' ? 'Balance' : (phase === 'advance' ? 'Advance' : 'Payment')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ReleaseDialog
        item={open}
        onClose={() => setOpen(null)}
        onDone={() => { setOpen(null); fetchQueue(); if (onRefresh) onRefresh(); }}
      />
    </>
  );
}

function ReleaseDialog({ item, onClose, onDone }) {
  const [method, setMethod] = useState('bank');
  const [bankRef, setBankRef] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeAmount, setChequeAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!item) return;
    setMethod('bank'); setBankRef(''); setChequeNo(''); setChequeAmount(''); setNotes('');
  }, [item]);

  if (!item) return null;
  const phase = item.next_payment_phase || 'full';
  const total = item.total_amount || item.estimated_price || 0;
  const paid = item.paid_amount || 0;
  const amount = phase === 'balance' ? Math.max(0, total - paid) : (phase === 'advance' ? (item.advance_amount || 0) : total);

  const submit = async () => {
    if (method === 'bank' && !bankRef.trim()) { toast.error('Bank reference required'); return; }
    if (method === 'cheque' && !chequeNo.trim()) { toast.error('Cheque number required'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/procurement-simple/material-requests/${item.request_id}/release-payment`, {
        payment_phase: phase,
        payment_method: method,
        bank_ref: bankRef,
        cheque_no: chequeNo,
        cheque_amount: parseFloat(chequeAmount) || 0,
        notes,
      });
      toast.success(`${phase} payment released`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Release failed');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <Wallet className="h-5 w-5" /> Release {phase === 'balance' ? 'Balance' : phase === 'advance' ? 'Advance' : 'Full'} Payment
          </DialogTitle>
          <DialogDescription className="text-xs">{item.material_name} → {item.vendor_name} · {item.project_name}</DialogDescription>
        </DialogHeader>
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center justify-between">
          <span className="text-xs text-emerald-700 font-semibold">Amount to release</span>
          <span className="text-2xl font-bold text-emerald-700">{fmt(amount)}</span>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'cash', label: 'Cash', Icon: Banknote },
              { v: 'bank', label: 'Bank', Icon: Building2 },
              { v: 'cheque', label: 'Cheque', Icon: FileSignature },
            ].map(({ v, label, Icon }) => (
              <button
                key={v}
                onClick={() => setMethod(v)}
                className={`flex flex-col items-center justify-center gap-1 px-2 py-2 rounded border text-xs ${
                  method === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-200 hover:border-emerald-300'
                }`}
                data-testid={`acc-mat-method-${v}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {method === 'bank' && (
            <div>
              <Label className="text-xs">Bank Reference / UTR *</Label>
              <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} className="mt-1" data-testid="acc-mat-bank-ref" />
            </div>
          )}
          {method === 'cheque' && (
            <>
              <div>
                <Label className="text-xs">Cheque Number *</Label>
                <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className="mt-1" data-testid="acc-mat-cheque-no" />
              </div>
              <div>
                <Label className="text-xs">Cheque Amount</Label>
                <Input type="number" value={chequeAmount} onChange={(e) => setChequeAmount(e.target.value)} className="mt-1" placeholder={String(amount)} />
              </div>
            </>
          )}
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-sm" data-testid="acc-mat-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting} data-testid="acc-mat-release-confirm">
            <Send className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Releasing…' : `Release ${fmt(amount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
