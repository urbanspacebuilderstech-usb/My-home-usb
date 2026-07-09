// PM Dashboard — Petty Cash tab with two views:
//   1. "Req Petty Cash"  → SE-raised petty cash requests (existing flow).
//   2. "Record Expense"  → SE-recorded petty-cash expenses awaiting accountant.
// Both share the same 3 lifecycle buckets: New Expense | Awaiting Accountant | Expense Recorded.
import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { ThumbsUp, ThumbsDown, Loader2, Wallet, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PMProjectDateFilter, useProjectDateFilter } from './PMProjectDateFilter';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

// Shared 3-bucket lifecycle (per user spec — Revisions removed).
const BUCKETS = [
  { key: 'new',                 label: 'New Expense',         cls: 'bg-amber-50 border-amber-200 text-amber-700',       active: 'bg-amber-600 text-white' },
  { key: 'awaiting_accountant', label: 'Awaiting Accountant', cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',          active: 'bg-cyan-600 text-white' },
  { key: 'expense_recorded',    label: 'Expense Recorded',    cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white' },
];

// Map petty_cash request → bucket. Revisions (rejected) roll back into "New Expense".
function bucketForPettyCash(p) {
  const s = (p.status || '').toLowerCase();
  if (s === 'requested') return 'new';
  if (s === 'rejected' || s === 'pm_rejected' || s === 'accountant_rejected') return 'new'; // SE will re-submit
  if (s === 'pm_approved') return 'awaiting_accountant';
  if (['issued', 'partially_settled', 'settled', 'completed', 'approved', 'payment_done', 'acknowledged'].includes(s)) return 'expense_recorded';
  return 'new';
}

// Map recorded_expense → bucket.
function bucketForRecordedExpense(e) {
  const s = (e.status || '').toLowerCase();
  // SE just submitted (or PM bounced it back) → PM action needed
  if (s === 'recorded' || s === 'pm_rejected' || s === '') return 'new';
  // PM has cleared it, accountant is the next gate
  if (s === 'pm_approved') return 'awaiting_accountant';
  // Accountant signed off (final) — old `approved` rows from before the gate
  // existed are also surfaced here so the history is not lost.
  if (['approved', 'verified', 'recorded_into_cashbook'].includes(s)) return 'expense_recorded';
  return 'new';
}

export default function PMPettyCashTabs({ pettyCashRequests, onRefresh }) {
  const [subTab, setSubTab] = useState('req_petty_cash');
  const [recordedExpenses, setRecordedExpenses] = useState([]);
  const [reLoading, setReLoading] = useState(false);

  const fetchRecorded = useCallback(async () => {
    setReLoading(true);
    try {
      const res = await axios.get(`${API}/pm/recorded-expenses`);
      setRecordedExpenses(res.data || []);
    } catch { setRecordedExpenses([]); }
    finally { setReLoading(false); }
  }, []);
  useEffect(() => { if (subTab === 'record_expense') fetchRecorded(); }, [subTab, fetchRecorded]);

  return (
    <div className="space-y-3" data-testid="pm-petty-cash-tab">
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5" data-testid="pm-pc-subtabs">
        {[
          { key: 'req_petty_cash', label: 'Req Petty Cash', Icon: Wallet,   activeCls: 'bg-amber-600 text-white shadow-sm' },
          { key: 'record_expense', label: 'Record Expense', Icon: FileText, activeCls: 'bg-emerald-600 text-white shadow-sm' },
        ].map(t => {
          const Icon = t.Icon;
          const active = subTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-all ${active ? t.activeCls : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              data-testid={`pm-pc-subtab-${t.key}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'req_petty_cash' && (
        <PettyCashRequestsView items={pettyCashRequests} onRefresh={onRefresh} />
      )}
      {subTab === 'record_expense' && (
        <RecordExpenseView items={recordedExpenses} loading={reLoading} onRefresh={fetchRecorded} />
      )}
    </div>
  );
}

// ----- Req Petty Cash (SE-raised petty cash request lifecycle) -----
function PettyCashRequestsView({ items, onRefresh }) {
  const [bucket, setBucket] = useState('new');
  const [actDialog, setActDialog] = useState({ open: false, item: null, action: null, reason: '' });
  const [submitting, setSubmitting] = useState(false);

  // Jul 03 2026 — Project + Date filters (parity with Material Requests tab).
  const projDateFilter = useProjectDateFilter(items);
  const filteredItems = projDateFilter.filteredItems;

  const counts = useMemo(() => {
    const c = {};
    BUCKETS.forEach(b => { c[b.key] = 0; });
    filteredItems.forEach(p => { const b = bucketForPettyCash(p); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [filteredItems]);
  const visible = useMemo(() => filteredItems.filter(p => bucketForPettyCash(p) === bucket), [filteredItems, bucket]);

  const submitAction = async () => {
    if (actDialog.action === 'reject' && !actDialog.reason.trim()) { toast.error('Reason required'); return; }
    setSubmitting(true);
    try {
      if (actDialog.action === 'approve') {
        await axios.patch(`${API}/pm/petty-cash/${actDialog.item.petty_cash_id}/approve`, { remarks: actDialog.reason });
        toast.success('Approved — sent to Accountant');
      } else {
        await axios.patch(`${API}/pm/petty-cash/${actDialog.item.petty_cash_id}/reject`, { reason: actDialog.reason });
        toast.success('Rejected');
      }
      setActDialog({ open: false, item: null, action: null, reason: '' });
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Action failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-2">
      <PMProjectDateFilter filter={projDateFilter} itemsCount={items.length} testIdPrefix="pm-pc-req" />
      <div className="grid grid-cols-3 gap-1.5" data-testid="pm-pc-req-buckets">
        {BUCKETS.map(b => {
          const active = bucket === b.key;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'}`} data-testid={`pm-pc-req-${b.key}`}>
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{counts[b.key] || 0}</span>
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No petty-cash requests in this bucket</CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="pm-pc-req-list">
          {visible.map(p => {
            const cfg = BUCKETS.find(b => b.key === bucketForPettyCash(p));
            const isNew = bucketForPettyCash(p) === 'new' && (p.status || '').toLowerCase() === 'requested';
            return (
              <Card key={p.petty_cash_id} data-testid={`pm-pc-req-card-${p.petty_cash_id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cfg && <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">#{p.petty_cash_id}</span>
                    </div>
                    <span className="text-sm font-semibold text-amber-700">{fmt(p.amount_requested)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="sm:col-span-2"><p className="text-[10px] uppercase font-semibold text-gray-400">Purpose</p><p className="font-medium truncate">{p.purpose || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Project</p><p className="font-medium truncate">{p.project_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Requested by</p><p className="font-medium truncate">{p.requested_by_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Created</p><p className="font-medium">{fmtDate(p.created_at)}</p></div>
                  </div>
                  {isNew && (
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => setActDialog({ open: true, item: p, action: 'reject', reason: '' })} data-testid={`pm-pc-reject-${p.petty_cash_id}`}>
                        <ThumbsDown className="h-3 w-3" /> Reject
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setActDialog({ open: true, item: p, action: 'approve', reason: '' })} data-testid={`pm-pc-approve-${p.petty_cash_id}`}>
                        <ThumbsUp className="h-3 w-3" /> Approve
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={actDialog.open} onOpenChange={(o) => !o && setActDialog({ open: false, item: null, action: null, reason: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actDialog.action === 'approve' ? <><ThumbsUp className="h-5 w-5 text-green-700" /> Approve Petty Cash</> : <><ThumbsDown className="h-5 w-5 text-red-700" /> Reject Petty Cash</>}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {actDialog.item?.purpose} · {fmt(actDialog.item?.amount_requested)}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">{actDialog.action === 'reject' ? 'Reason *' : 'Remarks (optional)'}</Label>
            <Textarea rows={3} value={actDialog.reason} onChange={(e) => setActDialog({ ...actDialog, reason: e.target.value })} className="mt-1 text-sm" data-testid="pm-pc-action-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setActDialog({ open: false, item: null, action: null, reason: '' })} disabled={submitting}>Cancel</Button>
            <Button size="sm" className={actDialog.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} onClick={submitAction} disabled={submitting} data-testid="pm-pc-action-confirm">
              {submitting ? '…' : (actDialog.action === 'approve' ? 'Approve' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- Record Expense (SE-recorded petty-cash expense lifecycle) -----
function RecordExpenseView({ items, loading, onRefresh }) {
  const [bucket, setBucket] = useState('new');
  const [actDialog, setActDialog] = useState({ open: false, item: null, action: null, reason: '' });
  const [submitting, setSubmitting] = useState(false);

  // Jul 03 2026 — Project + Date filters.
  const projDateFilter = useProjectDateFilter(items);
  const filteredItems = projDateFilter.filteredItems;

  const counts = useMemo(() => {
    const c = {};
    BUCKETS.forEach(b => { c[b.key] = 0; });
    filteredItems.forEach(i => { const b = bucketForRecordedExpense(i); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [filteredItems]);
  const visible = useMemo(() => filteredItems.filter(i => bucketForRecordedExpense(i) === bucket), [filteredItems, bucket]);

  const submitAction = async () => {
    if (actDialog.action === 'reject' && !actDialog.reason.trim()) { toast.error('Reason required'); return; }
    setSubmitting(true);
    try {
      const path = actDialog.action === 'approve' ? 'approve' : 'reject';
      const body = actDialog.action === 'approve' ? { remarks: actDialog.reason } : { reason: actDialog.reason };
      await axios.patch(`${API}/pm/recorded-expenses/${actDialog.item.expense_id}/${path}`, body);
      toast.success(actDialog.action === 'approve' ? 'Approved — sent to Accountant' : 'Rejected — returned to SE');
      setActDialog({ open: false, item: null, action: null, reason: '' });
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Action failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PMProjectDateFilter filter={projDateFilter} itemsCount={items.length} testIdPrefix="pm-pc-record" />
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRefresh}><RefreshCw className="h-3 w-3" /> Refresh</Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5" data-testid="pm-pc-record-buckets">
        {BUCKETS.map(b => {
          const active = bucket === b.key;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'}`} data-testid={`pm-pc-record-${b.key}`}>
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{counts[b.key] || 0}</span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No recorded expenses in this bucket</CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="pm-pc-record-list">
          {visible.map(e => {
            const cfg = BUCKETS.find(b => b.key === bucketForRecordedExpense(e));
            const status = (e.status || '').toLowerCase();
            const showActions = bucket === 'new' && (status === 'recorded' || status === 'pm_rejected' || status === '');
            return (
              <Card key={e.expense_id} data-testid={`pm-pc-record-card-${e.expense_id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cfg && <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">#{e.expense_id}</span>
                      {e.category && <Badge variant="outline" className="text-[9px] capitalize">{e.category.replace(/_/g, ' ')}</Badge>}
                      {status === 'pm_rejected' && <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200" variant="outline">PM Rejected</Badge>}
                    </div>
                    <span className="text-sm font-semibold text-red-700">{fmt(e.amount)}</span>
                  </div>
                  {status === 'pm_rejected' && e.rejection_reason && (
                    <div className="mb-1 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                      Reason: {e.rejection_reason}
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="sm:col-span-2"><p className="text-[10px] uppercase font-semibold text-gray-400">Description</p><p className="font-medium truncate">{e.description || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Vendor / Payee</p><p className="font-medium truncate">{e.vendor_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Project</p><p className="font-medium truncate">{e.project_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Recorded by</p><p className="font-medium truncate">{e.recorded_by_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Date</p><p className="font-medium">{fmtDate(e.created_at)}</p></div>
                  </div>
                  {(() => {
                    // Prefer the multi-item bills array; fall back to the
                    // single `bill_file_id` field on legacy rows.
                    const bills = Array.isArray(e.item_bills) && e.item_bills.length
                      ? e.item_bills.filter(b => b.bill_file_id)
                      : (e.bill_file_id ? [{ label: e.bill_filename || 'Bill', bill_file_id: e.bill_file_id, bill_filename: e.bill_filename }] : []);
                    if (!bills.length) return null;
                    return (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap" data-testid={`pm-pc-record-bills-${e.expense_id}`}>
                        <span className="text-[10px] uppercase text-gray-400 font-semibold">Bills:</span>
                        {bills.map((b, i) => (
                          <a
                            key={i}
                            href={`${API}/files/${b.bill_file_id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 underline hover:text-blue-800 inline-flex items-center gap-0.5"
                            title={b.bill_filename || b.label}
                            data-testid={`pm-pc-record-bill-${e.expense_id}-${i}`}
                          >
                            📎 {b.label || `Bill ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                  {showActions && (
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => setActDialog({ open: true, item: e, action: 'reject', reason: '' })} data-testid={`pm-pc-record-reject-${e.expense_id}`}>
                        <ThumbsDown className="h-3 w-3" /> Reject
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setActDialog({ open: true, item: e, action: 'approve', reason: '' })} data-testid={`pm-pc-record-approve-${e.expense_id}`}>
                        <ThumbsUp className="h-3 w-3" /> Approve
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={actDialog.open} onOpenChange={(o) => !o && setActDialog({ open: false, item: null, action: null, reason: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actDialog.action === 'approve' ? <><ThumbsUp className="h-5 w-5 text-green-700" /> Approve Recorded Expense</> : <><ThumbsDown className="h-5 w-5 text-red-700" /> Reject Recorded Expense</>}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {actDialog.item?.description} · {fmt(actDialog.item?.amount)}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">{actDialog.action === 'reject' ? 'Reason *' : 'Remarks (optional)'}</Label>
            <Textarea rows={3} value={actDialog.reason} onChange={(e) => setActDialog({ ...actDialog, reason: e.target.value })} className="mt-1 text-sm" data-testid="pm-pc-record-action-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setActDialog({ open: false, item: null, action: null, reason: '' })} disabled={submitting}>Cancel</Button>
            <Button size="sm" className={actDialog.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} onClick={submitAction} disabled={submitting} data-testid="pm-pc-record-action-confirm">
              {submitting ? '…' : (actDialog.action === 'approve' ? 'Approve' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
