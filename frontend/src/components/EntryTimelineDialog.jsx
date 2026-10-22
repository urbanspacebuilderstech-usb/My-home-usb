import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowRight, Calendar, CheckCircle, FileText, IndianRupee, Send, XCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { buildTimeline } from './OrderDetailDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtFull = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const PlainAmount = ({ value, className = '' }) => <span className={className}>{fmtFull(value)}</span>;
const defaultModeLabel = (m) => (m || '').replace(/_/g, ' ').toUpperCase();
// Same set the backend treats as "this leg no longer pays the bill"
// (_PAID_LEG_EXCLUDED_STATUS in financial.py).
const UNPAID_LEG_STATUS = new Set(['rejected', 'accountant_rejected', 'accounts_rejected', 'under_correction', 'cheque_bounced']);

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

const byDate = (a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0);
// "Cheque #041296", not "Cheque · Cheque #041296".
const modeAndRef = (mode, ref) => [ref && ref.startsWith(mode) ? '' : mode, ref].filter(Boolean).join(' · ');

// Material: the request's own approval/delivery steps (buildTimeline, shared
// with OrderDetailDialog), each bill Procurement sent to Accounts, and every
// payment leg against it.
function buildMaterialView({ request: req, bills = [], payments = [] }, entryId, modeLabel) {
  const events = buildTimeline(req, { skipPaymentStamps: payments.length > 0 });
  bills.forEach(b => {
    const phase = b.payment_phase && b.payment_phase !== 'full' ? `${b.payment_phase} ` : '';
    events.push({
      label: `Sent to Accounts for ${phase}payment`,
      amount: b.final_amount ?? b.amount ?? b.estimated_cost,
      by: 'Procurement',
      date: b.created_at,
      icon: FileText,
      color: 'text-indigo-600',
    });
  });
  payments.forEach(p => {
    const status = (p.status || '').toLowerCase();
    const unpaid = UNPAID_LEG_STATUS.has(status);
    const ref = p.cheque_number ? `Cheque #${p.cheque_number}` : (p.transaction_id || p.reference || '');
    events.push({
      label: `Payment Released${p.payment_phase ? ` (${p.payment_phase})` : ''}`
        + (unpaid ? ` — ${status === 'cheque_bounced' ? 'bounced' : status.replace(/_/g, ' ')}` : ''),
      amount: p.amount,
      by: p.recorded_by_name || 'Accountant',
      detail: modeAndRef(modeLabel(p.payment_method || p.payment_mode), ref),
      date: p.payment_date || p.created_at,
      icon: unpaid ? XCircle : CheckCircle,
      color: unpaid ? 'text-red-600' : 'text-emerald-600',
      current: p.expense_id === entryId,
      unpaid,
    });
    if (p.bounced_at) events.push({
      label: `Cheque bounced${p.bounce_reason ? `: "${p.bounce_reason}"` : ''}`,
      by: 'Accountant',
      date: p.bounced_at,
      icon: XCircle,
      color: 'text-red-600',
    });
  });

  const paid = payments
    .filter(p => !UNPAID_LEG_STATUS.has((p.status || '').toLowerCase()))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const orderValue = req.estimated_price || req.final_price || req.total_amount || 0;
  return {
    title: req.material_name || 'Material Timeline',
    code: req.request_number,
    status: req.status,
    summary: [
      { label: 'Project', value: req.project_name },
      { label: 'Vendor', value: req.vendor_name },
      { label: 'Quantity', value: req.quantity ? `${Number(req.quantity).toLocaleString('en-IN')} ${req.unit || ''}` : '' },
      { label: 'Site Engineer', value: req.site_engineer_name },
      { label: 'Order Value', amount: orderValue || null },
      ...(payments.length > 0 ? [{ label: 'Paid so far', amount: paid, cls: 'text-emerald-700' }] : []),
    ],
    events: events.sort(byDate),
  };
}

const INCOME_HISTORY_LABELS = {
  sent_for_correction: 'Sent back for correction',
  resubmitted: 'Resubmitted',
  rejected: 'Rejected',
  sent_back_to_approvals: 'Pulled back from Cashbook to Approvals',
  split_out_for_deleted_cheque: 'Split out — cheque deleted',
  cheque_deleted_share_split_out: 'Split out — cheque deleted',
};
const INCOME_SETBACKS = new Set(['rejected', 'sent_for_correction', 'sent_back_to_approvals']);

// Income: the payment stage Planning raised, the CRE's collection (with its
// cheque / DT steps), the accountant's verification and approval, and every
// correction, rejection, bounce or send-back. correction_history is the log;
// the income's own *_at stamps fill in what older paths never logged.
function buildIncomeView({ income: inc, stage, cheques = [], user_names: names = {} }, modeLabel) {
  const events = [];
  const nameOf = (name, id) => name || names[id] || '';
  const push = (date, label, by, extra = {}) => {
    if (date) events.push({ date, label, by: by || '—', icon: CheckCircle, color: 'text-gray-600', ...extra });
  };
  const setback = { icon: XCircle, color: 'text-red-600', unpaid: true };
  const reasonOf = (r) => (r ? `: "${r}"` : '');
  const near = (a, b) => a && b && Math.abs(new Date(a) - new Date(b)) < 60000;
  const stageName = stage?.stage_label || stage?.stage_name || inc.stage || '';

  if (stage) {
    push(stage.created_at, `Payment stage created${stageName ? ` — ${stageName}` : ''}`, stage.created_by_name || 'Planning',
      { icon: FileText, amount: stage.amount });
    push(stage.requested_at, 'Payment requested by Planning', stage.requested_by_name || 'Planning', {
      icon: Send,
      color: 'text-amber-600',
      detail: stage.expected_payment_date ? `Expected by ${fmtDate(stage.expected_payment_date)}` : '',
    });
    push(stage.cre_rejected_at, `Rejected by CRE${reasonOf(stage.cre_rejection_reason)}`, stage.cre_rejected_by_name || 'CRE', setback);
  }

  const chq = cheques.map(c => `Cheque #${c.cheque_number}${c.bank_name ? ` (${c.bank_name})` : ''}`).join(', ');
  const ref = inc.payment_reference || inc.reference_number || inc.reference || inc.transaction_id || '';
  const paidOn = inc.payment_date && inc.created_at && fmtDate(inc.payment_date) !== fmtDate(inc.created_at)
    ? `Client paid on ${fmtDate(inc.payment_date)}` : '';
  push(inc.created_at, inc.category === 'payment_collection' ? 'Payment collected by CRE' : 'Income recorded',
    nameOf(inc.collected_by_name || inc.recorded_by_name || inc.created_by_name, inc.collected_by || inc.recorded_by || inc.created_by) || 'CRE', {
      icon: IndianRupee,
      color: 'text-blue-600',
      amount: inc.amount,
      detail: [modeAndRef(modeLabel(inc.payment_mode), chq || ref), paidOn].filter(Boolean).join(' · '),
    });
  cheques.forEach(c => push(c.opened_at, `Cheque #${c.cheque_number} opened by CRE`, c.opened_by_name || 'CRE', { color: 'text-blue-600' }));

  if (inc.dt_assigned_at) {
    const n = (inc.dt_items || []).length;
    push(inc.dt_assigned_at, `DT split to ${n} payee${n === 1 ? '' : 's'}`, inc.dt_assigned_by_name, { icon: ArrowRight, color: 'text-blue-600' });
  }
  push(inc.dt_received_submitted_at, 'DT receipt confirmed', inc.dt_received_submitted_by_name, { icon: ArrowRight, color: 'text-blue-600' });
  push(inc.dt_completed_at, 'DT approved by Accountant', inc.dt_completed_by_name, { color: 'text-emerald-600' });

  const seen = new Set();
  const key = (action, at) => `${action}|${String(at).slice(0, 16)}`;
  (inc.correction_history || []).forEach(h => {
    seen.add(key(h.action, h.at));
    const edited = h.extra?.edited_fields;
    push(h.at, `${INCOME_HISTORY_LABELS[h.action] || (h.action || '').replace(/_/g, ' ')}${reasonOf(h.reason)}`, h.by_name, {
      ...(INCOME_SETBACKS.has(h.action) ? setback : { icon: ArrowRight, color: 'text-amber-600' }),
      detail: edited?.length ? `Changed: ${edited.join(', ').replace(/_/g, ' ')}` : '',
    });
  });
  const stamp = (action, at, by, reason) => {
    if (!at || seen.has(key(action, at))) return;
    seen.add(key(action, at));
    push(at, `${INCOME_HISTORY_LABELS[action]}${reasonOf(reason)}`, by,
      INCOME_SETBACKS.has(action) ? setback : { icon: ArrowRight, color: 'text-amber-600' });
  };
  stamp('rejected', inc.rejected_at, inc.rejected_by_name, inc.rejection_reason);
  stamp('rejected', inc.accountant_rejected_at, inc.accountant_rejected_by_name, inc.accountant_rejection_reason);
  stamp('rejected', inc.last_rejected_at, inc.last_rejected_by_name, inc.last_rejection_reason);
  stamp('resubmitted', inc.resubmitted_at, inc.resubmitted_by_name);
  stamp('sent_for_correction', inc.correction_requested_at, inc.correction_requested_by_name, inc.correction_reason);
  stamp('sent_back_to_approvals', inc.sent_back_to_approvals_at, inc.sent_back_to_approvals_by_name);

  const v = inc.verification || {};
  const vRef = v.cheque_number ? `Cheque #${v.cheque_number}` : (v.transaction_id ? `Txn ${v.transaction_id}` : '');
  const vDetail = [modeAndRef(v.verification_mode ? modeLabel(v.verification_mode) : '', vRef), v.notes].filter(Boolean).join(' · ');
  const approver = nameOf(inc.approved_by_name, inc.approved_by) || 'Accountant';
  const verifiedWithApproval = near(v.verified_at, inc.approved_at);
  if (v.verified_at && !verifiedWithApproval) {
    push(v.verified_at, 'Verified by Accountant', nameOf(v.verified_by_name, v.verified_by) || 'Accountant', { detail: vDetail, color: 'text-emerald-600' });
  }
  push(inc.approved_at, `${verifiedWithApproval ? 'Verified & approved' : 'Approved'} — added to Cashbook`, approver, {
    detail: verifiedWithApproval ? vDetail : '',
    color: 'text-emerald-600',
  });
  if (!near(inc.accountant_verified_at, inc.approved_at)) {
    push(inc.accountant_verified_at, 'Advance verified by Accountant', nameOf(null, inc.accountant_verified_by) || 'Accountant', { color: 'text-emerald-600' });
  }
  push(inc.sent_to_planning_at, 'Project sent to Planning', nameOf(inc.sent_to_planning_by_name, inc.sent_to_planning_by) || 'Accountant',
    { icon: Send, color: 'text-amber-600' });

  push(inc.bounced_at, `Cheque${inc.bounced_cheque_number ? ` #${inc.bounced_cheque_number}` : ''} bounced${reasonOf(inc.bounce_reason)}`, 'Accountant', setback);
  push(inc.last_partial_bounce_at, `Part of the cheque bounced${reasonOf(inc.last_partial_bounce_reason)}`, 'Accountant',
    { ...setback, amount: inc.partial_bounce_deducted || null });
  if (!inc.bounced_at && !inc.last_partial_bounce_at) {
    cheques.forEach(c => {
      if (c.status === 'bounced') push(c.bounced_at, `Cheque #${c.cheque_number} bounced${reasonOf(c.bounce_reason)}`, c.bounced_by_name || 'Accountant', setback);
    });
  }

  return {
    title: stageName || inc.description || 'Income',
    code: '',
    status: inc.status,
    summary: [
      { label: 'Project', value: inc.project_name },
      { label: 'Mode', value: modeAndRef(modeLabel(inc.payment_mode), chq || ref) },
      { label: 'Collected by', value: nameOf(inc.collected_by_name || inc.recorded_by_name, inc.collected_by || inc.recorded_by) },
      { label: 'Amount', amount: inc.amount, cls: 'text-green-700' },
      ...(stage ? [
        { label: 'Stage Value', amount: stage.amount || null },
        { label: 'Stage Received', amount: stage.amount_received || 0 },
      ] : []),
    ],
    events: events.sort(byDate),
  };
}

const KINDS = {
  material: { url: (id) => `${API}/accountant/material-timeline/${encodeURIComponent(id)}`, build: buildMaterialView },
  income: { url: (id) => `${API}/accountant/income-timeline/${encodeURIComponent(id)}`, build: (data, _id, modeLabel) => buildIncomeView(data, modeLabel) },
};

/**
 * Oct 22 2026 — Cashbook Income / Expense > eye icon. One list, oldest first,
 * of everything that happened to that entry: a material's request, bills and
 * payment legs (GET /accountant/material-timeline/{expense_id}), or an
 * income's payment stage, collection, approval and corrections
 * (GET /accountant/income-timeline/{income_id}).
 *
 * `Amount` renders a money value; AccountsBoard passes its MaskedValue so an
 * Accountant sees the same masking as the Cashbook tables.
 */
export default function EntryTimelineDialog({ open, onClose, kind, entryId, Amount = PlainAmount, modeLabel = defaultModeLabel }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !entryId || !KINDS[kind]) return undefined;
    let cancelled = false;
    setData(null);
    setError('');
    setLoading(true);
    axios.get(KINDS[kind].url(entryId))
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setError(err.response?.data?.detail || 'Failed to load the timeline'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, kind, entryId]);

  const view = data ? KINDS[kind].build(data, entryId, modeLabel) : null;
  const events = view?.events || [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-2xl max-h-[90dvh] sm:max-h-[90vh] overflow-y-auto p-0 rounded-xl sm:rounded-lg" data-testid="entry-timeline-dialog">
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 sm:px-6 sm:py-4 pr-10">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="text-base sm:text-lg font-bold">{view?.title || 'Timeline'}</DialogTitle>
            <DialogDescription className="sr-only">Everything that happened to this entry, oldest first</DialogDescription>
            {view && (view.code || view.status) && (
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                {view.code && <span className="font-mono">{view.code}</span>}
                {view.status && <Badge variant="outline" className="text-[10px] capitalize">{view.status.replace(/_/g, ' ')}</Badge>}
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="px-4 py-4 sm:px-6 space-y-4">
          {loading && <p className="text-center text-sm text-gray-400 py-8">Loading timeline…</p>}
          {error && <p className="text-center text-sm text-red-600 py-8" data-testid="entry-timeline-error">{error}</p>}
          {view && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-gray-50 rounded-lg border p-3" data-testid="entry-timeline-summary">
                {view.summary.map(s => (
                  <div key={s.label}>
                    <p className="text-gray-500">{s.label}</p>
                    {'amount' in s ? (
                      <p className={`font-semibold ${s.cls || 'text-gray-900'}`}>{s.amount != null ? <Amount value={s.amount} className={s.cls || ''} /> : '—'}</p>
                    ) : (
                      <p className="font-medium text-gray-900 break-words">{s.value || '—'}</p>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-gray-600" /> Timeline
                </h3>
                {events.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 text-sm">No timeline events recorded yet.</p>
                ) : (
                  <div className="relative pl-6" data-testid="entry-timeline">
                    <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
                    <div className="space-y-3">
                      {events.map((ev, idx) => {
                        const Icon = ev.icon;
                        return (
                          <div key={idx} className={`relative flex items-start gap-3 ${ev.current ? 'bg-amber-50 -mx-2 px-2 py-1 rounded-md' : ''}`}>
                            <div className={`absolute ${ev.current ? '-left-4' : '-left-6'} mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center bg-white border-2 ${idx === events.length - 1 ? 'border-orange-400' : 'border-gray-300'}`}>
                              <Icon className={`h-2.5 w-2.5 ${ev.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-medium ${ev.unpaid ? 'text-red-700' : 'text-gray-900'}`}>
                                  {ev.label}
                                  {ev.current && <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">This entry</Badge>}
                                </p>
                                {ev.amount != null && (
                                  <span className={`text-sm font-semibold whitespace-nowrap ${ev.unpaid ? 'text-red-600' : 'text-gray-900'}`}>
                                    <Amount value={ev.amount} />
                                  </span>
                                )}
                              </div>
                              {ev.detail && <p className="text-xs text-gray-600 break-words">{ev.detail}</p>}
                              <p className="text-xs text-gray-500">{ev.by} · {fmtDateTime(ev.date)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
