import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Eye, Send, CheckCircle, XCircle, Clock, Banknote } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

export default function PlanningLabourStageRequests() {
  const [tab, setTab] = useState('new');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/planning/labour-stage-requests?status=${tab}`);
      setItems(res.data?.requests || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); /* eslint-disable-next-line */ }, [tab]);

  const tabs = [
    { key: 'new', label: 'New Req' },
    { key: 'forwarded', label: 'Forwarded to Accountant' },
  ];

  return (
    <div className="space-y-3" data-testid="planning-labour-stage-req">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b bg-white rounded-t-lg px-2 pt-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            data-testid={`pls-tab-${t.key}`}
          >
            {t.label}
            {tab === t.key && items.length > 0 && (
              <Badge variant="outline" className="ml-1.5 bg-amber-100 text-amber-700 border-amber-300 text-[10px]">{items.length}</Badge>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className="h-4 w-4 text-amber-600" />
            Labour Stage Requests {!loading && `· ${items.length}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-xs text-gray-400 py-8">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-10">No {tab === 'new' ? 'new' : 'forwarded'} labour stage requests</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Project Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Contractor Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Site Engineer</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Stage Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Requested</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((r) => (
                    <tr key={r.request_id} className="hover:bg-amber-50/40" data-testid={`pls-row-${r.request_id}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.project_name}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{r.contractor_type || '—'}</Badge></td>
                      <td className="px-3 py-2 text-gray-700">{r.site_engineer_name || '—'}</td>
                      <td className="px-3 py-2 font-medium">{r.stage_name}</td>
                      <td className="px-3 py-2 text-gray-500 text-[11px]">{fmtDate(r.requested_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700" onClick={() => setOpen(r)} data-testid={`pls-open-${r.request_id}`}>
                          <Eye className="h-3 w-3" /> Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDialog item={open} onClose={() => setOpen(null)} onActionDone={() => { setOpen(null); fetchItems(); }} />
    </div>
  );
}

// =============================================================
// Detail dialog: shows stage amount, payment summary, approve/reject
// =============================================================
function DetailDialog({ item, onClose, onActionDone }) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (item) setNotes(''); }, [item]);

  if (!item) return null;

  const isNew = item.status === 'pm_approved';

  const act = async (action) => {
    setSubmitting(true);
    try {
      await axios.patch(
        `${API}/projects/${item.project_id}/work-orders/${item.work_order_id}/stages/${item.stage_id}/approve`,
        { request_id: item.request_id, action, notes }
      );
      toast.success(action === 'approve' ? 'Forwarded to Accountant' : 'Request rejected');
      onActionDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="pls-detail-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">{item.stage_name}</DialogTitle>
          <DialogDescription className="text-xs">
            {item.project_name} · {item.contractor_name} ({item.contractor_type || '—'})
          </DialogDescription>
        </DialogHeader>

        {/* Site Engineer info */}
        <div className="bg-gray-50 border rounded p-2 text-xs">
          <p><span className="text-gray-500">Requested by:</span> <span className="font-medium">{item.site_engineer_name}</span></p>
          <p className="text-gray-500 text-[10px] mt-0.5">on {fmtDate(item.requested_at)}</p>
        </div>

        {/* Stage Amount + Payment Summary */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Stage Amount</p>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
            <p className="text-[10px] text-amber-700 uppercase tracking-wide">This Stage Total</p>
            <p className="text-2xl font-bold text-amber-900">{fmt(item.stage_amount)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Payment Summary</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <p className="text-amber-700">This Request</p>
              <p className="font-bold text-amber-900">{fmt(item.amount)}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <p className="text-green-700">Released</p>
              <p className="font-bold text-green-800">{fmt(item.stage_released)}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-2">
              <p className="text-blue-700">In Pipeline</p>
              <p className="font-bold text-blue-800">{fmt(item.stage_pending)}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded p-2">
              <p className="text-gray-700">Stage Balance</p>
              <p className="font-bold text-gray-900">{fmt(item.stage_balance)}</p>
            </div>
          </div>
        </div>

        {/* Work-order summary */}
        <div className="border rounded p-2 text-[11px]">
          <div className="flex justify-between"><span className="text-gray-500">Work Order Total</span><span className="font-medium">{fmt(item.wo_total_value)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Work Order Paid</span><span className="font-medium text-green-700">{fmt(item.wo_paid_amount)}</span></div>
        </div>

        {/* Site engineer remarks */}
        {item.notes && (
          <div className="border rounded p-2 text-xs">
            <p className="text-[10px] text-gray-500 uppercase mb-0.5">Site Engineer Remarks</p>
            <p className="text-gray-700">{item.notes}</p>
          </div>
        )}

        {/* Planning notes */}
        {isNew && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Planning Notes (optional)</p>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add note before approving / rejecting" className="text-sm" data-testid="pls-notes" />
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Close</Button>
          {isNew && (
            <>
              <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => act('reject')} disabled={submitting} data-testid="pls-reject">
                <XCircle className="h-3 w-3 mr-1" /> Reject
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => act('approve')} disabled={submitting} data-testid="pls-approve">
                <CheckCircle className="h-3 w-3 mr-1" /> {submitting ? 'Forwarding...' : 'Approve & Forward to Accountant'}
              </Button>
            </>
          )}
          {!isNew && (
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px]">
              <Clock className="h-3 w-3 mr-1" /> Awaiting Accountant
            </Badge>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
