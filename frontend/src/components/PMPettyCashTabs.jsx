// PM Dashboard — Petty Cash tab with Income / Expense sub-tabs.
// Both flows show lifecycle filter cards + list. PM is the first approver in the chain.
import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Banknote, ThumbsUp, ThumbsDown, Loader2, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch { return s || '—'; } };

// Lifecycle bucket definitions per user spec.
const EXPENSE_BUCKETS = [
  { key: 'new',                 label: 'New Expense',          cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white' },
  { key: 'awaiting_accountant', label: 'Awaiting Accountant',  cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white' },
  { key: 'revisions',           label: 'Revisions',            cls: 'bg-orange-50 border-orange-200 text-orange-700',  active: 'bg-orange-600 text-white' },
  { key: 'expense_recorded',    label: 'Expense Recorded',     cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white' },
];
const INCOME_BUCKETS = [
  { key: 'new',                 label: 'New Request',          cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white' },
  { key: 'awaiting_accountant', label: 'Awaiting Accountant',  cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white' },
  { key: 'revisions',           label: 'Revisions',            cls: 'bg-orange-50 border-orange-200 text-orange-700',  active: 'bg-orange-600 text-white' },
  { key: 'acknowledged',        label: 'Acknowledged',         cls: 'bg-blue-50 border-blue-200 text-blue-700',        active: 'bg-blue-600 text-white' },
  { key: 'payment_done',        label: 'Payment Done',         cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white' },
];

// Map petty_cash status → expense bucket. PM is first approver.
function bucketForExpense(p) {
  const s = (p.status || '').toLowerCase();
  if (s === 'requested') return 'new';
  if (s === 'pm_approved') return 'awaiting_accountant';
  if (s === 'rejected' || s === 'pm_rejected') return 'revisions';
  if (['issued', 'partially_settled', 'settled', 'completed', 'approved'].includes(s)) return 'expense_recorded';
  return 'new';
}
// Map income.status → income bucket.
function bucketForIncome(i) {
  const s = (i.status || '').toLowerCase();
  if (s === 'requested' || s === 'pending') return 'new';
  if (s === 'pm_approved' || s === 'under_review') return 'awaiting_accountant';
  if (s === 'rejected' || s === 'revision_requested') return 'revisions';
  if (s === 'acknowledged' || s === 'pm_acknowledged') return 'acknowledged';
  if (s === 'approved' || s === 'payment_done') return 'payment_done';
  return 'new';
}

export default function PMPettyCashTabs({ pettyCashRequests, onRefresh }) {
  const [subTab, setSubTab] = useState('expense');
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [incomeLoading, setIncomeLoading] = useState(false);

  const fetchIncome = useCallback(async () => {
    setIncomeLoading(true);
    try {
      const res = await axios.get(`${API}/income`);
      setIncomeEntries(res.data || []);
    } catch { setIncomeEntries([]); }
    finally { setIncomeLoading(false); }
  }, []);
  useEffect(() => { if (subTab === 'income') fetchIncome(); }, [subTab, fetchIncome]);

  return (
    <div className="space-y-3" data-testid="pm-petty-cash-tab">
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5" data-testid="pm-pc-subtabs">
        {[
          { key: 'expense', label: 'Expense', Icon: ArrowUpCircle, color: 'amber' },
          { key: 'income',  label: 'Income',  Icon: ArrowDownCircle, color: 'emerald' },
        ].map(t => {
          const Icon = t.Icon;
          const active = subTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-all ${active ? `bg-${t.color}-600 text-white shadow-sm` : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              data-testid={`pm-pc-subtab-${t.key}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'expense' && (
        <ExpenseView items={pettyCashRequests} onRefresh={onRefresh} />
      )}
      {subTab === 'income' && (
        <IncomeView items={incomeEntries} loading={incomeLoading} onRefresh={fetchIncome} />
      )}
    </div>
  );
}

// ----- Expense (existing petty_cash flow) -----
function ExpenseView({ items, onRefresh }) {
  const [bucket, setBucket] = useState('new');
  const [actDialog, setActDialog] = useState({ open: false, item: null, action: null, reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    EXPENSE_BUCKETS.forEach(b => { c[b.key] = 0; });
    items.forEach(p => { const b = bucketForExpense(p); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [items]);

  const visible = useMemo(() => items.filter(p => bucketForExpense(p) === bucket), [items, bucket]);

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" data-testid="pm-pc-expense-buckets">
        {EXPENSE_BUCKETS.map(b => {
          const active = bucket === b.key;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'}`} data-testid={`pm-pc-expense-${b.key}`}>
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{counts[b.key] || 0}</span>
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No expense entries in this bucket</CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="pm-pc-expense-list">
          {visible.map(p => {
            const cfg = EXPENSE_BUCKETS.find(b => b.key === bucketForExpense(p));
            const isNew = bucketForExpense(p) === 'new';
            return (
              <Card key={p.petty_cash_id} data-testid={`pm-pc-expense-card-${p.petty_cash_id}`}>
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

// ----- Income (only petty-cash–related incomes; not all client payments) -----
function IncomeView({ items: allItems, loading, onRefresh }) {
  const [bucket, setBucket] = useState('new');
  // Restrict to incomes actually tied to the petty-cash flow (refunds, returns,
  // SE settlements). Without this filter the API's `/income` returns every
  // payment collection in the app, flooding the petty-cash tab with thousands
  // of unrelated rows.
  const items = useMemo(() => {
    const re = /petty[\s_-]*cash/i;
    return (allItems || []).filter(i => {
      if (i.petty_cash_id || i.linked_petty_cash_id || i.petty_cash_request_id) return true;
      if (['petty_cash', 'petty_cash_refund', 'petty_cash_return', 'petty_cash_settlement'].includes((i.source || '').toLowerCase())) return true;
      if (['petty_cash', 'petty_cash_refund', 'petty_cash_return'].includes((i.category || '').toLowerCase())) return true;
      if (i.description && re.test(i.description)) return true;
      return false;
    });
  }, [allItems]);
  const counts = useMemo(() => {
    const c = {};
    INCOME_BUCKETS.forEach(b => { c[b.key] = 0; });
    items.forEach(i => { const b = bucketForIncome(i); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [items]);
  const visible = useMemo(() => items.filter(i => bucketForIncome(i) === bucket), [items, bucket]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-2"><Banknote className="h-4 w-4" /> Income ({items.length})</h3>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRefresh}><RefreshCw className="h-3 w-3" /> Refresh</Button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5" data-testid="pm-pc-income-buckets">
        {INCOME_BUCKETS.map(b => {
          const active = bucket === b.key;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'}`} data-testid={`pm-pc-income-${b.key}`}>
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{counts[b.key] || 0}</span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No income entries in this bucket</CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="pm-pc-income-list">
          {visible.map(i => {
            const cfg = INCOME_BUCKETS.find(b => b.key === bucketForIncome(i));
            return (
              <Card key={i.income_id} data-testid={`pm-pc-income-card-${i.income_id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cfg && <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">#{i.income_id}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">{fmt(i.amount)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="sm:col-span-2"><p className="text-[10px] uppercase font-semibold text-gray-400">Source / Description</p><p className="font-medium truncate">{i.description || i.source || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Project</p><p className="font-medium truncate">{i.project_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Date</p><p className="font-medium">{fmtDate(i.income_date || i.created_at)}</p></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
