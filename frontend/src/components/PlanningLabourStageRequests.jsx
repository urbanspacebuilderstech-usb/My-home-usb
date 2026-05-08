import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Eye, CheckCircle, XCircle, Banknote, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

export default function PlanningLabourPayments() {
  const [tab, setTab] = useState('new');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [openReqs, setOpenReqs] = useState([]);
  const [openingId, setOpeningId] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/planning/labour-stage-requests?status=${tab}`);
      setItems(res.data?.requests || []);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  };

  const fetchOpenReqs = async () => {
    try {
      const res = await axios.get(`${API}/planning/stage-open-requests`);
      setOpenReqs(res.data?.requests || []);
    } catch { setOpenReqs([]); }
  };

  const approveOpen = async (r) => {
    setOpeningId(r.stage_id);
    try {
      await axios.patch(`${API}/projects/${r.project_id}/work-orders/${r.work_order_id}/stages/${r.stage_id}/open`);
      toast.success(`Opened ${r.stage_name}`);
      fetchOpenReqs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to open stage');
    } finally { setOpeningId(''); }
  };

  useEffect(() => { fetchItems(); /* eslint-disable-next-line */ }, [tab]);
  useEffect(() => { fetchOpenReqs(); }, []);

  const tabs = [
    { key: 'new', label: 'New Req' },
    { key: 'forwarded', label: 'Forwarded to Accountant' },
  ];

  return (
    <div className="space-y-3" data-testid="planning-labour-payments">
      {/* Stage Open Requests panel */}
      {openReqs.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <Eye className="h-4 w-4 text-amber-600" /> Stage Open Requests · {openReqs.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-amber-50 border-y border-amber-200">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold text-amber-700">Project</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-amber-700">Contractor</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-amber-700">Stage</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-amber-700">Requested By</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-amber-700">Reason</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-amber-700 w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {openReqs.map((r) => (
                    <tr key={`${r.work_order_id}_${r.stage_id}`} className="hover:bg-amber-50/40" data-testid={`pls-open-req-${r.stage_id}`}>
                      <td className="px-3 py-2">{r.project_name}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.contractor_name}</p>
                        <p className="text-[10px] text-gray-500">{r.contractor_type}</p>
                      </td>
                      <td className="px-3 py-2 font-medium">{r.stage_name}</td>
                      <td className="px-3 py-2">{r.requested_by_name}</td>
                      <td className="px-3 py-2 text-gray-600 text-[11px]">{r.notes || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" disabled={openingId === r.stage_id} onClick={() => approveOpen(r)} data-testid={`pls-open-approve-${r.stage_id}`}>
                          <CheckCircle className="h-3 w-3" /> {openingId === r.stage_id ? 'Opening...' : 'Open Stage'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
            Labour Payments {!loading && `· ${items.length}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-xs text-gray-400 py-8">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-10">No {tab === 'new' ? 'new' : 'forwarded'} labour payment requests</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Contractor Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Site Engineer</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Project Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Stage</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Amount</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((r) => (
                    <tr key={r.request_id} className="hover:bg-amber-50/40" data-testid={`pls-row-${r.request_id}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{r.contractor_name}</p>
                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 mt-0.5">{r.contractor_type || '—'}</Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.site_engineer_name || '—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.project_name}</td>
                      <td className="px-3 py-2 text-gray-700">{r.stage_name}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-700">{fmt(r.amount)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setOpen(r)} data-testid={`pls-open-${r.request_id}`}>
                          <Eye className="h-3 w-3" /> {tab === 'new' ? 'Approve' : 'View'}
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

function DetailDialog({ item, onClose, onActionDone }) {
  const [mode, setMode] = useState('approve_same');  // approve_same | approve_diff | reject
  const [diffAmount, setDiffAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) { setMode('approve_same'); setDiffAmount(String(item.amount || '')); setReason(''); }
  }, [item]);

  if (!item) return null;
  const isNew = item.status === 'pm_approved';

  const act = async (action, payload = {}) => {
    setSubmitting(true);
    try {
      await axios.patch(
        `${API}/projects/${item.project_id}/work-orders/${item.work_order_id}/stages/${item.stage_id}/approve`,
        { request_id: item.request_id, action, ...payload }
      );
      toast.success(action === 'approve' ? 'Forwarded to Accountant' : 'Request rejected');
      onActionDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally { setSubmitting(false); }
  };

  const handleSubmit = () => {
    if (mode === 'reject') {
      if (!reason.trim()) { toast.error('Rejection reason is required'); return; }
      act('reject', { notes: reason });
    } else if (mode === 'approve_same') {
      act('approve', { notes: reason });
    } else if (mode === 'approve_diff') {
      const amt = parseFloat(diffAmount || 0);
      if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
      if (amt > item.stage_balance + 0.01) { toast.error(`Amount exceeds stage balance (${fmt(item.stage_balance)})`); return; }
      if (!reason.trim()) { toast.error('Reason is required when changing the amount'); return; }
      act('approve', { approved_amount: amt, notes: reason });
    }
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

        {/* Stage Amount + summary */}
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
          <p className="text-[10px] text-amber-700 uppercase tracking-wide">Site Engineer's Request</p>
          <p className="text-2xl font-bold text-amber-900">{fmt(item.amount)}</p>
          <p className="text-[10px] text-amber-700 mt-1">Stage Total: {fmt(item.stage_amount)}</p>
        </div>

        {item.se_exceeds_balance && (
          <div className="bg-orange-50 border border-orange-300 rounded p-2 text-xs">
            <p className="font-bold text-orange-900">⚠ Exceeds current stage balance</p>
            <p className="text-orange-800 mt-0.5">
              Stage balance was <span className="font-medium">{fmt(item.se_balance_at_request)}</span>, request is <span className="font-medium">{fmt(item.amount)}</span>.
              {item.next_stage_name ? <> If you approve, <span className="font-medium">{fmt(item.amount - item.se_balance_at_request)}</span> overflow will be deducted from <span className="font-medium">"{item.next_stage_name}"</span> (capacity {fmt(item.next_stage_capacity)}).</> : ' No next stage available — cannot absorb overflow.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-green-50 border border-green-200 rounded p-2">
            <p className="text-green-700">Released</p>
            <p className="font-bold text-green-800">{fmt(item.stage_released)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2">
            <p className="text-blue-700">In Pipeline</p>
            <p className="font-bold text-blue-800">{fmt(item.stage_pending)}</p>
          </div>
          <div className="bg-gray-50 border rounded p-2">
            <p className="text-gray-500">Stage Balance</p>
            <p className="font-bold text-gray-900">{fmt(item.stage_balance)}</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded p-2">
            <p className="text-violet-700">WO Paid / Total</p>
            <p className="font-bold text-violet-900 text-[11px]">{fmt(item.wo_paid_amount)} / {fmt(item.wo_total_value)}</p>
          </div>
        </div>

        {item.notes && (
          <div className="border rounded p-2 text-xs">
            <p className="text-[10px] text-gray-500 uppercase mb-0.5">Site Engineer Remarks</p>
            <p className="text-gray-700">{item.notes}</p>
          </div>
        )}

        {isNew ? (
          <>
            {/* Mode pills */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setMode('approve_same')}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${mode === 'approve_same' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                data-testid="pls-mode-same"
              >
                <CheckCircle className="h-3 w-3 inline mr-1" /> Approve as-is ({fmt(item.amount)})
              </button>
              <button
                onClick={() => setMode('approve_diff')}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${mode === 'approve_diff' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                data-testid="pls-mode-diff"
              >
                <Pencil className="h-3 w-3 inline mr-1" /> Different Amount
              </button>
              <button
                onClick={() => setMode('reject')}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${mode === 'reject' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                data-testid="pls-mode-reject"
              >
                <XCircle className="h-3 w-3 inline mr-1" /> Reject
              </button>
            </div>

            {mode === 'approve_diff' && (
              <div>
                <Label className="text-xs">Approved Amount (max {fmt(item.stage_balance)})</Label>
                <Input type="number" value={diffAmount} onChange={(e) => setDiffAmount(e.target.value)} className="mt-1 text-sm" data-testid="pls-diff-amount" />
              </div>
            )}

            <div>
              <Label className="text-xs">{mode === 'reject' ? 'Rejection Reason *' : mode === 'approve_diff' ? 'Reason for Change *' : 'Planning Notes (optional)'}</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 text-sm" placeholder={mode === 'reject' ? 'Why rejecting...' : 'Optional remarks'} data-testid="pls-reason" />
            </div>
          </>
        ) : (
          <>
            {item.planning_amount_changed && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                <p className="font-semibold text-amber-900">Planning adjusted the amount</p>
                <p className="text-amber-800 mt-0.5">SE requested: <span className="font-medium">{fmt(item.original_amount)}</span> · Approved: <span className="font-medium">{fmt(item.amount)}</span></p>
                {item.planning_change_reason && <p className="text-amber-700 mt-1 italic">"{item.planning_change_reason}"</p>}
              </div>
            )}
            {item.planning_notes && !item.planning_amount_changed && (
              <div className="border rounded p-2 text-xs">
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Planning Notes</p>
                <p className="text-gray-700">{item.planning_notes}</p>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Close</Button>
          {isNew && (
            <Button
              size="sm"
              className={mode === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
              onClick={handleSubmit}
              disabled={submitting}
              data-testid="pls-submit"
            >
              {submitting ? 'Submitting...' : mode === 'reject' ? 'Reject Request' : 'Approve & Forward to Accountant'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
