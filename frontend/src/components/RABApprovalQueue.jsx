// Shared queue for Labour RAB (Running Account Bill) requests.
// Used by PM Dashboard, QC Dashboard, Planning Board, and Site Engineer rework view.
// Each role passes its `role` prop; component fetches the appropriate queue and
// renders Approve / Reject (with reason) actions per the RAB approval chain.
//
//   SE → PM → QC → Planning → Accountant
//   Reject sends back to previous role with reason banner.

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Banknote, CheckCircle, XCircle, Clock, FileText, Building2, User as UserIcon, Hammer, AlertTriangle, Send } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

// Map role → { endpointBase, statusFilter, approveLabel, approveAction, rejectAction, headerLabel }
const ROLE_CONFIG = {
  project_manager:  { base: '/pm', listStatus: 'new', approve: 'pm-approve', reject: 'pm-reject', label: 'PM Review', nextRole: 'QC', color: 'amber' },
  super_admin_pm:   { base: '/pm', listStatus: 'new', approve: 'pm-approve', reject: 'pm-reject', label: 'PM Review (SA)', nextRole: 'QC', color: 'amber' },
  quality_check:    { base: '/qc', listStatus: 'new', approve: 'qc-approve', reject: 'qc-reject', label: 'QC Review', nextRole: 'Planning', color: 'cyan' },
  planning:         { base: '/planning', listStatus: 'new', approve: 'planning-approve', reject: 'planning-reject', label: 'Planning Review', nextRole: 'Accountant', color: 'indigo' },
  planning_person:  { base: '/planning', listStatus: 'new', approve: 'planning-approve', reject: 'planning-reject', label: 'Planning Review', nextRole: 'Accountant', color: 'indigo' },
};

export default function RABApprovalQueue({ role, title }) {
  const cfg = ROLE_CONFIG[role];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('new'); // 'new' | 'forwarded'
  const [decisionDialog, setDecisionDialog] = useState({ open: false, item: null, mode: 'approve', notes: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!cfg) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API}${cfg.base}/labour-stage-requests?status=${view}`);
      setItems(res.data?.requests || []);
    } catch (err) {
      setItems([]);
    } finally { setLoading(false); }
  }, [cfg, view]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (!cfg) return null;

  const submitDecision = async () => {
    const { item, mode, notes, reason } = decisionDialog;
    if (!item) return;
    if (mode === 'reject' && !reason.trim()) { toast.error('Rejection reason required'); return; }
    setBusy(true);
    try {
      const action = mode === 'approve' ? cfg.approve : cfg.reject;
      const url = `${API}/projects/${item.project_id}/work-orders/${item.work_order_id}/stages/${item.stage_id}/payment-requests/${item.request_id}/${action}`;
      const body = mode === 'approve' ? { notes } : { reason };
      await axios.post(url, body);
      toast.success(`${item.rab_number || 'RAB'} ${mode === 'approve' ? `forwarded to ${cfg.nextRole}` : 'rejected'}`);
      setDecisionDialog({ open: false, item: null, mode: 'approve', notes: '', reason: '' });
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${mode}`);
    } finally { setBusy(false); }
  };

  const colorClass = {
    amber: 'border-l-amber-500 bg-amber-50/40',
    cyan: 'border-l-cyan-500 bg-cyan-50/40',
    indigo: 'border-l-indigo-500 bg-indigo-50/40',
  }[cfg.color];

  return (
    <Card data-testid={`rab-queue-${role}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className={`h-4 w-4 text-${cfg.color}-600`} />
            {title || `${cfg.label} — Labour RAB Queue`} ({items.length})
          </CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={view === 'new' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setView('new')}
              data-testid={`rab-tab-new-${role}`}
            >Pending Action</Button>
            <Button
              size="sm"
              variant={view === 'forwarded' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setView('forwarded')}
              data-testid={`rab-tab-forwarded-${role}`}
            >Forwarded ({cfg.nextRole})</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <Banknote className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">
              {view === 'new' ? 'No RABs awaiting your action.' : `No RABs forwarded to ${cfg.nextRole} yet.`}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.request_id}
              className={`border-l-4 ${colorClass} border rounded p-3 space-y-1.5`}
              data-testid={`rab-card-${item.request_id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs bg-white">{item.rab_number || 'RAB'}</Badge>
                  <span className="font-bold text-sm">{fmt(item.amount)}</span>
                  {item.se_exceeds_balance && (
                    <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Exceeds Balance
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] text-gray-500">{fmtDate(item.requested_at)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-0.5 text-xs">
                <p className="flex items-center gap-1 text-gray-700">
                  <Building2 className="h-3 w-3" /> <span className="font-medium">{item.project_name}</span>
                </p>
                <p className="flex items-center gap-1 text-gray-700">
                  <Hammer className="h-3 w-3" /> {item.contractor_name} <span className="text-gray-400">({item.contractor_type})</span>
                </p>
                <p className="flex items-center gap-1 text-gray-700">
                  <FileText className="h-3 w-3" /> Stage: <span className="font-medium">{item.stage_name}</span>
                </p>
                <p className="flex items-center gap-1 text-gray-700">
                  <UserIcon className="h-3 w-3" /> By {item.requested_by_name}
                </p>
              </div>
              <div className="text-[11px] text-gray-600 grid grid-cols-3 gap-1 bg-white/60 p-1.5 rounded border">
                <span>Stage Total: <span className="font-medium">{fmt(item.stage_amount)}</span></span>
                <span>Released: <span className="font-medium text-emerald-700">{fmt(item.stage_released)}</span></span>
                <span>Balance: <span className="font-medium text-blue-700">{fmt(item.stage_balance)}</span></span>
              </div>
              {item.notes && <p className="text-[11px] text-gray-700 italic">Note: "{item.notes}"</p>}
              {item.dlr_summary && <p className="text-[11px] text-gray-700">DLR: {item.dlr_summary}</p>}
              {item.pm_approved_by_name && (
                <p className="text-[10px] text-amber-700">✓ PM: {item.pm_approved_by_name} · {fmtDate(item.pm_approved_at)}{item.pm_notes ? ` · "${item.pm_notes}"` : ''}</p>
              )}
              {item.qc_approved_by_name && (
                <p className="text-[10px] text-cyan-700">✓ QC: {item.qc_approved_by_name} · {fmtDate(item.qc_approved_at)}{item.qc_notes ? ` · "${item.qc_notes}"` : ''}</p>
              )}
              {item.planning_approved_by_name && (
                <p className="text-[10px] text-indigo-700">✓ Planning: {item.planning_approved_by_name} · {fmtDate(item.planning_approved_at)}{item.planning_notes ? ` · "${item.planning_notes}"` : ''}</p>
              )}
              {view === 'new' && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setDecisionDialog({ open: true, item, mode: 'approve', notes: '', reason: '' })}
                    data-testid={`rab-approve-${item.request_id}`}
                  ><CheckCircle className="h-3 w-3 mr-1" /> Approve → {cfg.nextRole}</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => setDecisionDialog({ open: true, item, mode: 'reject', notes: '', reason: '' })}
                    data-testid={`rab-reject-${item.request_id}`}
                  ><XCircle className="h-3 w-3 mr-1" /> Reject</Button>
                </div>
              )}
              {view === 'forwarded' && (
                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                  <Send className="h-2.5 w-2.5 mr-0.5" /> With {cfg.nextRole}
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={decisionDialog.open} onOpenChange={(v) => !v && setDecisionDialog({ ...decisionDialog, open: false })}>
        <DialogContent className="max-w-md" data-testid="rab-decision-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              {decisionDialog.mode === 'approve' ? (
                <><CheckCircle className="h-5 w-5 text-emerald-600" /> Approve {decisionDialog.item?.rab_number}</>
              ) : (
                <><XCircle className="h-5 w-5 text-red-600" /> Reject {decisionDialog.item?.rab_number}</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="bg-gray-50 border rounded p-2">
              <p className="text-gray-500 text-[10px] uppercase">Stage / Amount</p>
              <p className="font-semibold">{decisionDialog.item?.stage_name} — {fmt(decisionDialog.item?.amount)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{decisionDialog.item?.contractor_name} · {decisionDialog.item?.project_name}</p>
            </div>
            {decisionDialog.mode === 'approve' ? (
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  rows={2}
                  value={decisionDialog.notes}
                  onChange={(e) => setDecisionDialog({ ...decisionDialog, notes: e.target.value })}
                  placeholder="Add any review notes for the next approver"
                  data-testid="rab-approve-notes"
                />
              </div>
            ) : (
              <div>
                <Label className="text-xs">Rejection Reason *</Label>
                <Textarea
                  rows={3}
                  value={decisionDialog.reason}
                  onChange={(e) => setDecisionDialog({ ...decisionDialog, reason: e.target.value })}
                  placeholder="Explain why this RAB is being rejected"
                  data-testid="rab-reject-reason"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ ...decisionDialog, open: false })} disabled={busy}>Cancel</Button>
            <Button
              className={decisionDialog.mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              onClick={submitDecision}
              disabled={busy}
              data-testid="rab-decision-confirm"
            >
              {busy ? 'Submitting…' : (decisionDialog.mode === 'approve' ? `Approve → ${cfg.nextRole}` : 'Confirm Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
