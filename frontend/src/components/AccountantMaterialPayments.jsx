import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Wallet, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import PayApprovalDialog from './PayApprovalDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';

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
export default function AccountantMaterialPayments({ onRefresh, legacyExpenses = [], projectFilter = '' }) {
  const [rawItems, setRawItems] = useState([]);
  // Project filter (from Approvals header) — applies to live queue rows.
  const items = !projectFilter
    ? rawItems
    : rawItems.filter(r => (r.project_id || r.project_name) === projectFilter);
  const [loading, setLoading] = useState(true);
  const [payDialog, setPayDialog] = useState({ open: false, requestId: '' });
  const [rejectDialog, setRejectDialog] = useState({ open: false, exp: null, kind: '', reason: '', busy: false });

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/procurement-simple/accountant/queue`);
      setRawItems(r.data?.requests || []);
    } catch {
      setRawItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const openPayDialog = async (req) => {
    // Jul 7 2026 — Partially Collected mid-flow rows (advance paid, request
    // still in transit / procurement verification): create/reuse the balance
    // bill on demand, then open the SAME PayApprovalDialog (all payment
    // modes, suspense, partial legs work identically).
    if (req.partially_collected && req.awaiting_stage) {
      try {
        const r = await axios.post(`${API}/procurement-simple/material-requests/${req.request_id}/prepare-balance-bill`);
        setPayDialog({ open: true, requestId: r.data.expense_id });
      } catch (e) {
        toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not prepare balance bill');
      }
      return;
    }
    if (!req.expense_id) {
      toast.error('Expense entry not yet mirrored for this request — try Refresh in a moment.');
      return;
    }
    setPayDialog({ open: true, requestId: req.expense_id });
  };

  const submitReject = async () => {
    const exp = rejectDialog.exp;
    if (!exp) return;
    setRejectDialog(d => ({ ...d, busy: true }));
    try {
      if (rejectDialog.kind === 'request' && exp.request_id) {
        // New procurement-flow material request
        await axios.patch(`${API}/accountant/material-requests/${exp.request_id}/reject?reason=${encodeURIComponent(rejectDialog.reason || 'Rejected by accountant')}`);
      } else if (exp.expense_id) {
        // Legacy mirrored expense entry
        await axios.post(`${API}/approvals/material/${exp.expense_id}/reject`, {
          reason: rejectDialog.reason || 'Rejected by accountant'
        });
      } else {
        throw new Error('No id available for reject');
      }
      toast.success('Material request rejected');
      setRejectDialog({ open: false, exp: null, kind: '', reason: '', busy: false });
      fetchQueue();
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Reject failed');
      setRejectDialog(d => ({ ...d, busy: false }));
    }
  };

  // Legacy material_expenses (no live material_request parent). Dedupe by
  // expense_id against live items so we don't show the same row twice when
  // both collections are populated.
  const liveExpenseIds = new Set(items.map(i => i.expense_id).filter(Boolean));
  const legacyToShow = (legacyExpenses || []).filter(e => e.expense_id && !liveExpenseIds.has(e.expense_id));

  // Jul 7 2026 — "Partially Collected" sub-tab: separates partially-paid
  // entries from fresh pending ones. Same payment modes & actions in both.
  const [subTab, setSubTab] = useState('pending');
  const isPartial = (req) => req.status === 'partially_paid' || !!req.last_partial_paid_at || !!req.partially_collected;
  const isLegacyPartial = (exp) => {
    const amt = exp.final_amount || exp.estimated_cost || exp.estimated_price || 0;
    const paid = exp.total_paid || exp.paid_amount || 0;
    return paid > 0 && paid < amt;
  };
  const partialItems = items.filter(isPartial);
  const pendingItems = items.filter(r => !isPartial(r));
  const partialLegacy = legacyToShow.filter(isLegacyPartial);
  const pendingLegacy = legacyToShow.filter(e => !isLegacyPartial(e));
  const showItems = subTab === 'partial' ? partialItems : pendingItems;
  const showLegacy = subTab === 'partial' ? partialLegacy : pendingLegacy;
  const pendingCount = pendingItems.length + pendingLegacy.length;
  const partialCount = partialItems.length + partialLegacy.length;

  if (loading) return <p className="text-center text-xs text-gray-400 py-6">Loading material payments…</p>;

  return (
    <>
      {/* Sub-tabs: Pending | Partially Collected */}
      <div className="flex items-center gap-1.5 mb-2" data-testid="acc-material-subtabs">
        <button
          type="button"
          onClick={() => setSubTab('pending')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition ${subTab === 'pending' ? 'bg-amber-600 text-white border-amber-600' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}
          data-testid="acc-material-subtab-pending"
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('partial')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition ${subTab === 'partial' ? 'bg-yellow-500 text-white border-yellow-500' : 'border-yellow-400 text-yellow-700 hover:bg-yellow-50'}`}
          data-testid="acc-material-subtab-partial"
        >
          Partially Collected ({partialCount})
        </button>
      </div>
      {showItems.length === 0 && showLegacy.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-6">
          {subTab === 'partial' ? 'No partially collected material payments' : 'No pending material payments'}
        </p>
      )}
      <div className="space-y-2" data-testid="acc-material-payments">
        {showItems.map(req => {
          const phase = req.next_payment_phase || 'full';
          const total = req.total_amount || req.estimated_price || 0;
          const paid = req.paid_amount || 0;
          const due = phase === 'balance' ? Math.max(0, total - paid) : (phase === 'advance' ? (req.advance_amount || 0) : total);
          const phaseColor = phase === 'advance' ? 'orange' : phase === 'balance' ? 'cyan' : 'blue';
          return (
            <div key={req.request_id} className="relative">
              {req.is_high_priority && (
                <div
                  className="absolute -top-2 left-3 z-10 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide shadow-md flex items-center gap-1"
                  data-testid={`acc-mat-priority-ribbon-${req.request_id}`}
                >
                  ⚡ High Priority
                </div>
              )}
              <Card className={`hover:shadow-md transition-shadow border-l-4 ${req.is_high_priority ? 'ring-2 ring-red-300' : ''} ${req.cheque_bounced ? 'ring-1 ring-red-200' : ''} ${req.status === 'partially_paid' || req.last_partial_paid_at ? 'ring-1 ring-yellow-200' : ''}`} style={{ borderLeftColor: req.is_high_priority ? '#dc2626' : (req.cheque_bounced ? '#dc2626' : (req.last_partial_paid_at || req.status === 'partially_paid') ? '#eab308' : (phaseColor === 'orange' ? '#ea580c' : phaseColor === 'cyan' ? '#0891b2' : '#2563eb')) }}>
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
                {req.partially_collected && (
                  <div className="mb-2 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 text-[11px] text-yellow-800 flex items-center justify-between flex-wrap gap-1" data-testid={`acc-mat-partial-strip-${req.request_id}`}>
                    <span><span className="font-semibold">Collected:</span> {fmt(req.collected_amount || 0)} of {fmt(total)}</span>
                    <span className="font-bold">Balance Due: {fmt(req.balance_due || 0)}</span>
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
                    {req.partially_collected && (
                      <Badge className="bg-yellow-500 text-white text-[10px]">Partially Collected</Badge>
                    )}
                    {req.awaiting_stage && (
                      <Badge variant="outline" className="text-[10px] border-sky-300 text-sky-700 bg-sky-50">{req.awaiting_stage}</Badge>
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
                  <span className="text-base font-bold text-emerald-700">{fmt(req.balance_due > 0 ? req.balance_due : (req.remaining_balance > 0 ? req.remaining_balance : due))}</span>
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
                    <p className="font-medium">{fmt(total)} / {fmt(req.partially_collected ? (req.collected_amount || 0) : paid)}</p>
                  </div>
                </div>
                <div className="flex justify-end items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => setRejectDialog({ open: true, exp: req, kind: 'request', reason: '', busy: false })}
                    data-testid={`acc-mat-reject-${req.request_id}`}
                  >
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => openPayDialog(req)} data-testid={`acc-mat-release-${req.request_id}`}>
                    <Wallet className="h-3 w-3" /> {req.partially_collected ? 'Release Payment' : ((req.status === 'partially_paid' || req.last_partial_paid_at) ? 'Pay Balance' : `Release ${phase === 'balance' ? 'Balance' : (phase === 'advance' ? 'Advance' : 'Payment')}`)}
                  </Button>
                </div>
              </CardContent>
            </Card>
            </div>
          );
        })}

        {/* Legacy material_expenses (orphan / no live parent material_request) */}
        {showLegacy.map(exp => {
          const amt = exp.final_amount || exp.estimated_cost || exp.estimated_price || 0;
          return (
            <Card key={`legacy-${exp.expense_id}`} className="hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: '#6b7280' }}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-700 border-gray-300">Legacy</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{(exp.payment_phase || 'full')} payment</Badge>
                    {exp.payment_mode && <Badge variant="outline" className="text-[10px] capitalize">{exp.payment_mode.replace(/_/g, ' ')}</Badge>}
                    {exp.source_request_id && <span className="text-[10px] text-gray-400 font-mono">#{exp.source_request_id}</span>}
                  </div>
                  <span className="text-base font-bold text-emerald-700">{fmt(amt)}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Material</p>
                    <p className="font-medium truncate">{exp.material_name || exp.description || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Vendor</p>
                    <p className="font-medium truncate">{exp.vendor_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Project</p>
                    <p className="font-medium truncate">{exp.project_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-semibold">Status</p>
                    <p className="font-medium truncate">{(exp.status || '').replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => setRejectDialog({ open: true, exp, kind: 'legacy', reason: '', busy: false })}
                    data-testid={`acc-mat-reject-legacy-${exp.expense_id}`}
                  >
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPayDialog({ open: true, requestId: exp.expense_id })} data-testid={`acc-mat-release-legacy-${exp.expense_id}`}>
                    <Wallet className="h-3 w-3" /> Release Payment
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

      <Dialog open={rejectDialog.open} onOpenChange={(o) => !o && !rejectDialog.busy && setRejectDialog({ open: false, exp: null, kind: '', reason: '', busy: false })}>
        <DialogContent className="max-w-md" data-testid="material-reject-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Reject Material {rejectDialog.kind === 'request' ? 'Request' : 'Expense'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will mark the entry as rejected and remove it from the Accountant Approvals queue.
              The parent material request (if still present) will also be flagged as rejected so it goes back through the flow.
            </DialogDescription>
          </DialogHeader>
          {rejectDialog.exp && (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-3 space-y-1 text-xs">
                <p className="font-semibold text-sm">{rejectDialog.exp.material_name || rejectDialog.exp.description}</p>
                <p>Vendor: <span className="font-medium">{rejectDialog.exp.vendor_name || '-'}</span></p>
                <p>Project: <span className="font-medium">{rejectDialog.exp.project_name || '-'}</span></p>
                <p>Amount: <span className="font-bold text-red-700">{fmt(rejectDialog.exp.total_amount || rejectDialog.exp.final_amount || rejectDialog.exp.estimated_price || rejectDialog.exp.estimated_cost || 0)}</span></p>
              </CardContent>
            </Card>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">Reason</label>
            <Textarea
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog(d => ({ ...d, reason: e.target.value }))}
              placeholder="e.g. Wrong vendor / incorrect quantity / duplicate entry"
              rows={2}
              data-testid="material-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, exp: null, kind: '', reason: '', busy: false })} disabled={rejectDialog.busy} data-testid="material-reject-cancel">Cancel</Button>
            <Button onClick={submitReject} disabled={rejectDialog.busy} className="bg-red-600 hover:bg-red-700" data-testid="material-reject-submit">
              <XCircle className="h-4 w-4 mr-1" /> {rejectDialog.busy ? 'Rejecting...' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

