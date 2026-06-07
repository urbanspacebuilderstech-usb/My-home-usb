import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import PayApprovalDialog from './PayApprovalDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

/**
 * Accountant queue for material payments coming from the new Procurement flow.
 * Shows requests with status:
 *   - pending_accounts_approval  (full or advance phase, depending on payment_mode)
 *   - pending_balance_payment    (balance leg after SE confirms delivery for advance mode)
 *
 * Releases via the unified PayApprovalDialog (cheque suspense + active/inactive
 * CRE-opened cheque picker + auto excess-to-suspense). Each material_request
 * carries an `expense_id` back-link to its mirrored material_expenses row.
 */
export default function AccountantMaterialPayments({ onRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payDialog, setPayDialog] = useState({ open: false, requestId: '' });

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

  const openPayDialog = (req) => {
    if (!req.expense_id) {
      toast.error('Expense entry not yet mirrored for this request — try Refresh in a moment.');
      return;
    }
    setPayDialog({ open: true, requestId: req.expense_id });
  };

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
            <Card key={req.request_id} className={`hover:shadow-md transition-shadow border-l-4 ${req.cheque_bounced ? 'ring-1 ring-red-200' : ''} ${req.status === 'partially_paid' || req.last_partial_paid_at ? 'ring-1 ring-yellow-200' : ''}`} style={{ borderLeftColor: req.cheque_bounced ? '#dc2626' : (req.last_partial_paid_at || req.status === 'partially_paid') ? '#eab308' : (phaseColor === 'orange' ? '#ea580c' : phaseColor === 'cyan' ? '#0891b2' : '#2563eb') }}>
              <CardContent className="p-3 sm:p-4">
                {req.cheque_bounced && (
                  <div className="mb-2 bg-red-50 border border-red-200 rounded px-2 py-1.5 text-[11px] text-red-700 flex items-start gap-1.5">
                    <span className="font-semibold">⚠ Cheque Bounced:</span>
                    <span>#{req.bounced_from_cheque_number} · {fmt(req.bounced_from_cheque_amount)} · {req.bounce_reason || 'No reason'}</span>
                  </div>
                )}
                {(req.status === 'partially_paid' || req.last_partial_paid_at) && req.remaining_balance > 0 && (
                  <div className="mb-2 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 text-[11px] text-yellow-800 flex items-center justify-between">
                    <span><span className="font-semibold">Partially Paid:</span> {fmt(req.paid_amount || 0)} of {fmt(total)} paid</span>
                    <span className="font-bold">Balance: {fmt(req.remaining_balance)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {req.cheque_bounced && (
                      <Badge className="bg-red-600 text-white text-[10px]">Cheque Bounced</Badge>
                    )}
                    {(req.status === 'partially_paid' || req.last_partial_paid_at) && (
                      <Badge className="bg-yellow-500 text-white text-[10px]">Partially Paid</Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] capitalize bg-${phaseColor}-50 text-${phaseColor}-700 border-${phaseColor}-200`}>
                      {phase} payment
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{(req.payment_mode || '').replace(/_/g, ' ')}</Badge>
                    {req.request_number && (
                      <Badge variant="outline" className="text-[10px] font-mono border-violet-300 text-violet-700 bg-violet-50">{req.request_number}</Badge>
                    )}
                    {req.order_id && <span className="text-[10px] text-gray-400 font-mono">#{req.order_id}</span>}
                  </div>
                  <span className="text-base font-bold text-emerald-700">{fmt(req.remaining_balance > 0 ? req.remaining_balance : due)}</span>
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
                  <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => openPayDialog(req)} data-testid={`acc-mat-release-${req.request_id}`}>
                    <Wallet className="h-3 w-3" /> {(req.status === 'partially_paid' || req.last_partial_paid_at) ? 'Pay Balance' : `Release ${phase === 'balance' ? 'Balance' : (phase === 'advance' ? 'Advance' : 'Payment')}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PayApprovalDialog
        open={payDialog.open}
        onOpenChange={(o) => !o && setPayDialog({ open: false, requestId: '' })}
        reqType="material"
        requestId={payDialog.requestId}
        onPaid={() => { setPayDialog({ open: false, requestId: '' }); fetchQueue(); if (onRefresh) onRefresh(); }}
      />
    </>
  );
}

