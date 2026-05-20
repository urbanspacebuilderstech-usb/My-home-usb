// Labour Advance Approvals queue — pending items for the current user role.
// Mounted inside PM Dashboard, GM Dashboard, and Accountant Approval Queue.
import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Banknote, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const STATUS_CFG = {
  pending_pm: { label: 'Pending PM', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  pending_gm: { label: 'Pending GM', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  pending_accountant: { label: 'Pending Accountant', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200' },
};

export default function LabourAdvanceQueue({ role }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decisionDialog, setDecisionDialog] = useState({ open: false, request: null, action: 'approve', remarks: '' });
  const [busy, setBusy] = useState(false);

  // Map role -> backend status filter so we only pull what this role can act on
  // Returning null fetches the full audit list (backend already role-scopes the response)
  // so the user can see where each request currently sits in the pipeline.
  const statusForRole = () => null;

  const fetchItems = async () => {
    setLoading(true);
    try {
      const status = statusForRole();
      const res = await axios.get(`${API}/labour-advance-requests${status ? `?status=${status}` : ''}`);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); /* eslint-disable-next-line */ }, [role]);

  const decide = async () => {
    const { request, action, remarks } = decisionDialog;
    if (!request) return;
    setBusy(true);
    try {
      await axios.patch(`${API}/labour-advance-requests/${request.request_id}/${action}`, { remarks: remarks || '' });
      toast.success(`Request ${action}d`);
      setDecisionDialog({ open: false, request: null, action: 'approve', remarks: '' });
      fetchItems();
    } catch (e) { toast.error(e.response?.data?.detail || `Failed to ${action}`); }
    setBusy(false);
  };

  const canAct = (req) => {
    if (req.status === 'pending_pm' && (role === 'project_manager' || role === 'associate_pm' || role === 'super_admin')) return true;
    if (req.status === 'pending_gm' && (role === 'general_manager' || role === 'super_admin')) return true;
    if (req.status === 'pending_accountant' && (role === 'accountant' || role === 'super_admin')) return true;
    return false;
  };

  return (
    <Card data-testid="labour-advance-queue">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4 text-emerald-600" /> Labour Advance Requests ({items.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">No labour advance requests yet.</p>
        ) : (() => {
          const actionable = items.filter(canAct);
          const others = items.filter((r) => !canAct(r));
          const renderRow = (req) => {
              const cfg = STATUS_CFG[req.status] || { label: req.status, color: 'bg-gray-100 text-gray-700' };
              return (
                <div key={req.request_id} className="border rounded-lg p-3 hover:bg-gray-50/60" data-testid={`lar-row-${req.request_id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{req.project_name} — {req.stage_name}</p>
                      <p className="text-[11px] text-gray-500">
                        {req.contractor_name || 'Labour'} · {req.request_date} · Raised by {req.requested_by_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                      <span className="text-sm font-bold text-emerald-700">{fmt(req.amount)}</span>
                    </div>
                  </div>
                  {req.reason && <p className="text-[11px] text-gray-600 mt-1 bg-gray-50 px-2 py-1 rounded">Reason: {req.reason}</p>}
                  {/* Audit trail */}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 flex-wrap">
                    {req.pm_approved_by_name && <span>PM ✓ {req.pm_approved_by_name}</span>}
                    {req.gm_approved_by_name && <span>GM ✓ {req.gm_approved_by_name}</span>}
                    {req.accountant_approved_by_name && <span>Accountant ✓ {req.accountant_approved_by_name}</span>}
                    {req.rejected_by_name && <span className="text-red-500">Rejected by {req.rejected_by_name}</span>}
                  </div>
                  {canAct(req) && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => setDecisionDialog({ open: true, request: req, action: 'approve', remarks: '' })} data-testid={`approve-lar-${req.request_id}`}>
                        <CheckCircle className="h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => setDecisionDialog({ open: true, request: req, action: 'reject', remarks: '' })} data-testid={`reject-lar-${req.request_id}`}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
          };
          return (
            <div className="space-y-4">
              {actionable.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Awaiting Your Action ({actionable.length})
                  </p>
                  <div className="space-y-2">{actionable.map(renderRow)}</div>
                </div>
              )}
              {others.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    Pipeline & History ({others.length})
                  </p>
                  <div className="space-y-2 opacity-90">{others.map(renderRow)}</div>
                </div>
              )}
              {actionable.length === 0 && others.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">Nothing here yet.</p>
              )}
            </div>
          );
        })()}

        <Dialog open={decisionDialog.open} onOpenChange={(v) => { if (!v) setDecisionDialog({ ...decisionDialog, open: false }); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{decisionDialog.action === 'approve' ? 'Approve' : 'Reject'} Labour Advance</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-xs text-gray-600">
                {decisionDialog.request?.project_name} — {decisionDialog.request?.stage_name} — <span className="font-semibold text-emerald-700">{fmt(decisionDialog.request?.amount)}</span>
              </div>
              <div>
                <label className="text-xs font-medium">Remarks {decisionDialog.action === 'reject' && <span className="text-red-500">*</span>}</label>
                <Textarea rows={2} value={decisionDialog.remarks} onChange={(e) => setDecisionDialog({ ...decisionDialog, remarks: e.target.value })} className="mt-1 text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDecisionDialog({ ...decisionDialog, open: false })}>Cancel</Button>
              <Button size="sm" disabled={busy || (decisionDialog.action === 'reject' && !decisionDialog.remarks.trim())} className={decisionDialog.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} onClick={decide} data-testid="confirm-decision-btn">
                {busy ? 'Saving…' : (decisionDialog.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
