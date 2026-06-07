import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import {
  Building2,
  Hash,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  IndianRupee,
  FileText,
  Loader2,
  AlertTriangle,
  Download,
  Eye
} from 'lucide-react';

// Module-scope status map so the focused sub-popup can reuse it without
// re-declaring the same lookup.
const STATUS = {
  requested:          { label: 'Pending PM',        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  pm_approved:        { label: 'Pending QC',        cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  qc_approved:        { label: 'Pending Planning',  cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  planning_approved:  { label: 'Pending Accountant',cls: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  approved:           { label: 'Released',          cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected:           { label: 'Rejected',          cls: 'bg-red-100 text-red-700 border-red-200' },
  se_rework:          { label: 'Returned to SE',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
};

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Reusable popup that renders the full RAB ladder for a Work Order.
 * Used from:
 *   - ProjectDetail → Work Orders table
 *   - RAB Approval Queue / Site Engineer & Planning RAB list
 * Triggered manually by clicking a View button on a payment summary row.
 */
export function RABDetailDialog({ open, onOpenChange, projectId, workOrderId, highlightRequestId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focusedRab, setFocusedRab] = useState(null); // stacked single-RAB sub-popup

  // Direct download — OTP gate removed per business request. Backend still
  // serves the signed PDF over an authenticated session.
  const downloadRabPdf = async (rab) => {
    if (!rab || rab.status !== 'approved') return;
    try {
      const r = await fetch(
        `${API}/projects/${projectId}/work-orders/${workOrderId}/rabs/${rab.request_id}/pdf`,
        { credentials: 'include' }
      );
      if (!r.ok) throw new Error('Download failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rab.rab_number || 'RAB'}_${(data?.contractor_name || 'vendor').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${rab.rab_number} downloaded`);
    } catch (e) {
      toast.error(e.message || 'Download failed');
    }
  };

  useEffect(() => {
    if (!open || !projectId || !workOrderId) return;
    setLoading(true);
    setError(null);
    setData(null);
    axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}/rab-chain`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load RAB chain'))
      .finally(() => setLoading(false));
  }, [open, projectId, workOrderId]);

  const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch { return String(iso).slice(0, 10); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0" data-testid="rab-detail-dialog">
        <DialogHeader className="px-5 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-600" />
            RAB Bill Detail
          </DialogTitle>
          <DialogDescription className="text-xs">
            Running Account Bill history for this Work Order — every payment request, its approval timeline, and the running closing balance.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading RAB chain...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm mx-5">
            <AlertTriangle className="h-4 w-4 inline mr-1" /> {error}
          </div>
        )}

        {data && (
          <div className="flex-1 min-h-0 flex flex-col px-5">
            {/* Header summary — compact 6-tile single row */}
            <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/60 to-violet-50/20 p-2.5 shrink-0">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <Tile icon={Building2}    label="Vendor"        value={data.contractor_name || '—'} accent="text-violet-700" />
                <Tile icon={Hash}         label="Work Order"    value={data.work_order_number || data.work_order_id?.slice(0, 8)} accent="text-violet-700" />
                <Tile icon={IndianRupee}  label="Contract"      value={inr(data.contract_total)} accent="text-blue-700" />
                <Tile icon={CheckCircle2} label="Released"      value={inr(data.total_released)} accent="text-emerald-700" />
                <Tile icon={Clock}        label="Balance"       value={inr(data.balance_after_all)} accent="text-orange-700" />
                <Tile icon={FileText}     label="RABs"          value={`${data.rab_count}`} accent="text-gray-900" />
              </div>
            </div>

            {/* Per-RAB cards — only one when highlightRequestId is set */}
            <div className={`mt-2 space-y-2 min-h-0 ${highlightRequestId ? '' : 'overflow-y-auto pr-1'}`} data-testid="rab-detail-list">
              {data.rabs.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <FileText className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                  <p>No RAB raised yet for this Work Order.</p>
                </div>
              ) : (highlightRequestId
                  ? data.rabs.filter(r => r.request_id === highlightRequestId)
                  : data.rabs
                ).map((rab) => {
                const st = STATUS[rab.status] || { label: rab.status || 'Unknown', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
                return (
                  <div
                    key={rab.request_id}
                    className="rounded-lg border border-violet-300 bg-white p-3 transition-all"
                    data-testid={`rab-card-${rab.rab_number || rab.request_id}`}
                  >
                    {/* RAB header — invoice-style: title left, dates right */}
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2 pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-violet-600 text-white border-violet-700 font-bold px-2 py-0.5 text-xs">
                          {rab.rab_number}
                        </Badge>
                        <span className="text-xs font-semibold text-gray-900">{rab.stage_name}</span>
                        <Badge className={`border text-[10px] ${st.cls}`}>{st.label}</Badge>
                      </div>
                      {/* Invoice-style dates block: aligned to the right, label
                          above value, with both dates stacked. Released is
                          shown only when this RAB is actually released. */}
                      <div className="flex flex-col items-end text-[10px] leading-tight">
                        {(() => {
                          const reqAt = rab.timeline?.[0]?.at;
                          return reqAt ? (
                            <div className="text-right">
                              <span className="text-gray-500 uppercase tracking-wider font-medium">Requested</span>
                              <p className="text-gray-900 font-semibold text-xs">{fmtDate(reqAt)}</p>
                            </div>
                          ) : null;
                        })()}
                        {rab.released_at && (
                          <div className="text-right mt-1">
                            <span className="text-emerald-600 uppercase tracking-wider font-medium">Released</span>
                            <p className="text-emerald-700 font-bold text-xs">{fmtDate(rab.released_at)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Download button row */}
                    <div className="flex justify-end mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rab.status !== 'approved'}
                        onClick={() => downloadRabPdf(rab)}
                        title={rab.status !== 'approved' ? 'Available after Accountant release' : 'Download signed RAB PDF'}
                        data-testid={`rab-download-${rab.rab_number}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download {rab.rab_number}
                      </Button>
                    </div>

                    {/* Summary / Timeline / Total RAB's inner tabs */}
                    <RABCardTabs
                      rab={rab}
                      inr={inr}
                      fmtDate={fmtDate}
                      projectId={projectId}
                      workOrderId={workOrderId}
                      releasedSiblings={(data.rabs || []).filter(r => r.status === 'approved' && r.request_id !== rab.request_id)}
                      onView={(target) => setFocusedRab(target)}
                      onDownload={(target) => downloadRabPdf(target)}
                    />

                    {rab.status === 'rejected' && rab.rejection_reason && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-semibold text-red-900">
                            Rejected{rab.rejected_by_role ? ` by ${rab.rejected_by_role}` : ''}
                            {rab.rejected_by_name ? ` (${rab.rejected_by_name})` : ''}
                          </p>
                          <p className="text-red-700 mt-0.5">{rab.rejection_reason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer summary — pinned at bottom of content area */}
            <div className="mt-2 rounded-lg bg-violet-600 text-white p-2.5 grid grid-cols-4 gap-2 shrink-0">
              <FooterTile label="Contract" value={inr(data.contract_total)} />
              <FooterTile label="Released" value={inr(data.total_released)} />
              <FooterTile label="Balance" value={inr(data.balance_after_all)} />
              <FooterTile label="RABs" value={`${data.rab_count}`} />
            </div>
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="rab-detail-close">Close</Button>
        </DialogFooter>
      </DialogContent>
      {/* Stacked sub-popup for a single focused (released) RAB. Parent dialog
          stays mounted underneath so the user can dismiss this view and pick
          another previous RAB without losing context. */}
      <RABFocusedDialog
        open={!!focusedRab}
        rab={focusedRab}
        inr={inr}
        fmtDate={fmtDate}
        onClose={() => setFocusedRab(null)}
        onDownload={(target) => downloadRabPdf(target)}
      />
    </Dialog>
  );
}

const Tile = ({ icon: Icon, label, value, accent }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-2.5">
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide font-medium">
      <Icon className="h-3 w-3" /> {label}
    </div>
    <p className={`text-sm font-bold mt-0.5 truncate ${accent || 'text-gray-900'}`}>{value}</p>
  </div>
);

const SmallTile = ({ label, value, valueClass }) => (
  <div>
    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
    <p className={`text-sm font-bold mt-0.5 ${valueClass || 'text-gray-900'}`}>{value}</p>
  </div>
);

const FooterTile = ({ label, value }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wide text-white/70 font-medium">{label}</p>
    <p className="text-base font-bold mt-0.5">{value}</p>
  </div>
);

/**
 * Inner Summary / Timeline / Total RAB's tabs for each RAB card.
 *  • Summary  → headline closing balance + key amounts
 *  • Timeline → approval ladder (SE → PM → QC → Planning → Accountant)
 *  • Total RAB's → list of OTHER released RABs on this WO with stacked View
 *    and OTP-gated Download. Clicking View opens a focused sub-popup on top
 *    of the parent so users can drill between historical RABs without losing
 *    the current context.
 */
function RABCardTabs({ rab, inr, fmtDate, releasedSiblings = [], onView, onDownload, projectId, workOrderId }) {
  const isApproved = rab.status === 'approved';
  // Lazy-loaded DLR rollup for this RAB's billing window. Same backend
  // endpoint as the SE request popup so the data is consistent.
  const [dlrPreview, setDlrPreview] = useState(null);
  const [dlrLoading, setDlrLoading] = useState(false);
  const hasDateWindow = !!(rab.from_date && rab.to_date);
  // Fetch only when the user opens the DLR tab (defer via state below).
  const loadDlr = async () => {
    if (!hasDateWindow || dlrPreview || dlrLoading) return;
    setDlrLoading(true);
    try {
      const r = await axios.get(
        `${API}/projects/${projectId}/work-orders/${workOrderId}/dlrs-for-rab`,
        { params: { from_date: rab.from_date, to_date: rab.to_date } }
      );
      setDlrPreview(r.data);
    } catch { setDlrPreview(null); }
    finally { setDlrLoading(false); }
  };
  return (
    <Tabs defaultValue="summary" className="w-full" onValueChange={(v) => { if (v === 'dlr') loadDlr(); }}>
      <TabsList className="bg-gray-50 p-1 h-auto gap-1 mb-3">
        <TabsTrigger
          value="summary"
          className="text-[11px] px-3 py-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
          data-testid={`rab-${rab.rab_number}-tab-summary`}
        >Summary</TabsTrigger>
        <TabsTrigger
          value="timeline"
          className="text-[11px] px-3 py-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
          data-testid={`rab-${rab.rab_number}-tab-timeline`}
        >Timeline</TabsTrigger>
        <TabsTrigger
          value="dlr"
          disabled={!hasDateWindow}
          className="text-[11px] px-3 py-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white disabled:opacity-40"
          data-testid={`rab-${rab.rab_number}-tab-dlr`}
          title={hasDateWindow ? 'DLR rollup for the billing window' : 'No billing window set for this RAB'}
        >DLR Report</TabsTrigger>
        <TabsTrigger
          value="totalrab"
          className="text-[11px] px-3 py-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
          data-testid={`rab-${rab.rab_number}-tab-totalrab`}
        >{"Total RAB's"}
          <span className="ml-1.5 text-[9px] font-bold opacity-80">({releasedSiblings.length})</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="m-0">
        <div className="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-3 mb-2">
          <p className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold">Closing Balance After {rab.rab_number}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-orange-700 mt-0.5">{inr(rab.closing_balance_after)}</p>
          <p className="text-[10px] text-orange-600/80 mt-0.5">Cumulative released: {inr(rab.cumulative_released_after)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Stage Amount" value={inr(rab.stage_amount)} />
          <MiniStat label="Requested" value={inr(rab.requested_amount)} />
          <MiniStat
            label="Released"
            value={isApproved ? inr(rab.approved_amount) : '—'}
            valueClass={isApproved ? 'text-emerald-700' : 'text-gray-400'}
          />
        </div>
        {rab.notes && (
          <p className="mt-2 text-[11px] text-gray-600 italic line-clamp-2 border-l-2 border-violet-200 pl-2">&quot;{rab.notes}&quot;</p>
        )}
        {/* DLR variance banner inside Summary — surfaces the SE-entered
            reason whenever the released/requested amount drifts from the
            DLR roll-up of the billing window. Shown only on released or
            requested rows where a reason was recorded. */}
        {rab.excess_dlr_reason && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2" data-testid={`rab-${rab.rab_number}-excess`}>
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Excess / Variance Reason</p>
            <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">{rab.excess_dlr_reason}</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="dlr" className="m-0">
        {/* DLR rollup table for the exact billing window the SE set on
            the RAB request. Mirrors the Site Engineer's pre-submit view. */}
        {!hasDateWindow ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-center">
            <FileText className="h-5 w-5 text-gray-300 mx-auto mb-1" />
            <p className="text-xs text-gray-500">No billing window set on this RAB.</p>
            <p className="text-[10px] text-gray-400">DLR rollup requires both From Date and To Date.</p>
          </div>
        ) : dlrLoading ? (
          <p className="text-[11px] text-gray-500 text-center py-3">Loading DLRs…</p>
        ) : !dlrPreview ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-center">
            <p className="text-[11px] text-gray-500">Click DLR Report tab to load…</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <p className="text-[10px] uppercase tracking-wider text-violet-700 font-bold">
                Billing window · {fmtDate(rab.from_date)} → {fmtDate(rab.to_date)}
              </p>
              <span className="text-[10px] text-violet-700 font-medium">
                {dlrPreview.days_with_dlr} / {dlrPreview.total_days_in_range} days
              </span>
            </div>
            {dlrPreview.rows.length === 0 ? (
              <p className="text-[11px] text-gray-500 text-center py-3" data-testid={`rab-${rab.rab_number}-dlr-empty`}>
                No DLR records logged in this window.
              </p>
            ) : (
              <div className="overflow-x-auto rounded border border-violet-200 bg-white">
                <table className="w-full text-[10px]">
                  <thead className="bg-violet-100 text-violet-900">
                    <tr>
                      <th className="px-1.5 py-1 text-left">Date</th>
                      <th className="px-1 py-1 text-left">Day</th>
                      <th className="px-1 py-1 text-center">Skilled</th>
                      <th className="px-1 py-1 text-center">Semi-Skilled</th>
                      <th className="px-1 py-1 text-center">Unskilled</th>
                      <th className="px-1 py-1 text-center font-bold">Workers</th>
                      <th className="px-1 py-1 text-right font-bold">Day Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlrPreview.rows.map((r) => {
                      const cell = (cnt, rate, amount, colour) => (
                        cnt > 0 ? (
                          <div className="leading-tight">
                            <p className={`font-bold ${colour}`}>{cnt} × {inr(rate)}</p>
                            <p className="text-emerald-700 font-semibold text-[9px]">= {inr(amount)}</p>
                          </div>
                        ) : <span className="text-gray-300">—</span>
                      );
                      return (
                        <tr key={r.report_id} className="border-t border-violet-100">
                          <td className="px-1.5 py-1 font-medium text-gray-800">
                            {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-1 py-1 text-gray-600">
                            {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                          </td>
                          <td className="px-1 py-1 text-center">{cell(r.skilled, r.skilled_rate, r.skilled_cost, 'text-indigo-700')}</td>
                          <td className="px-1 py-1 text-center">{cell(r.semi_skilled, r.semi_skilled_rate, r.semi_skilled_cost, 'text-blue-700')}</td>
                          <td className="px-1 py-1 text-center">{cell(r.unskilled, r.unskilled_rate, r.unskilled_cost, 'text-amber-700')}</td>
                          <td className="px-1 py-1 text-center font-bold text-gray-900">{r.total_workers}</td>
                          <td className="px-1 py-1 text-right font-bold text-emerald-700">{inr(r.total_cost)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-violet-50 border-t-2 border-violet-300 font-bold">
                      <td className="px-1.5 py-1 text-violet-900" colSpan={2}>Total · {dlrPreview.days_with_dlr}/{dlrPreview.total_days_in_range} d</td>
                      <td className="px-1 py-1 text-center">
                        <div className="leading-tight"><p className="text-indigo-800">{dlrPreview.totals.skilled}</p><p className="text-emerald-700 font-semibold text-[9px]">{inr(dlrPreview.totals.skilled_cost)}</p></div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <div className="leading-tight"><p className="text-blue-800">{dlrPreview.totals.semi_skilled}</p><p className="text-emerald-700 font-semibold text-[9px]">{inr(dlrPreview.totals.semi_skilled_cost)}</p></div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <div className="leading-tight"><p className="text-amber-800">{dlrPreview.totals.unskilled}</p><p className="text-emerald-700 font-semibold text-[9px]">{inr(dlrPreview.totals.unskilled_cost)}</p></div>
                      </td>
                      <td className="px-1 py-1 text-center text-gray-900">{dlrPreview.totals.total_workers}</td>
                      <td className="px-1 py-1 text-right text-emerald-800">{inr(dlrPreview.totals.total_cost)}</td>
                    </tr>
                    <tr className="bg-emerald-50 border-t border-emerald-200">
                      <td colSpan={6} className="px-1.5 py-1.5 text-right font-bold text-emerald-900 uppercase tracking-wider text-[10px]">Grand Total</td>
                      <td className="px-1 py-1.5 text-right font-extrabold text-emerald-800 text-[12px]">{inr(dlrPreview.totals.total_cost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {/* Variance vs the RAB amount — gives PM / vendor an at-a-glance
                comparison of authorised payment vs DLR-implied cost. */}
            {(() => {
              const dlr = Math.round(dlrPreview.totals.total_cost || 0);
              const reqAmt = Math.round(isApproved ? (rab.approved_amount || 0) : (rab.requested_amount || 0));
              const diff = reqAmt - dlr;
              if (!dlr && !reqAmt) return null;
              const palette = diff > 0
                ? { wrap: 'border-amber-200 bg-amber-50/60', title: 'text-amber-800', sub: 'text-amber-700' }
                : diff < 0
                ? { wrap: 'border-sky-200 bg-sky-50/60', title: 'text-sky-800', sub: 'text-sky-700' }
                : { wrap: 'border-emerald-200 bg-emerald-50/60', title: 'text-emerald-800', sub: 'text-emerald-700' };
              return (
                <div className={`rounded-lg border p-2 ${palette.wrap}`} data-testid={`rab-${rab.rab_number}-dlr-variance`}>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <p className="text-gray-500 uppercase tracking-wider font-semibold">{isApproved ? 'Released' : 'Requested'}</p>
                      <p className="font-bold text-gray-900 text-sm">{inr(reqAmt)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 uppercase tracking-wider font-semibold">DLR Total</p>
                      <p className="font-bold text-emerald-700 text-sm">{inr(dlr)}</p>
                    </div>
                    <div>
                      <p className={`uppercase tracking-wider font-semibold ${palette.title}`}>
                        {diff > 0 ? '↑ Excess' : diff < 0 ? '↓ Short' : '= Match'}
                      </p>
                      <p className={`font-bold text-sm ${palette.title}`}>{inr(Math.abs(diff))}</p>
                    </div>
                  </div>
                  {rab.excess_dlr_reason && (
                    <p className={`text-[10px] mt-2 ${palette.sub} italic`}>
                      <span className="font-semibold not-italic">Reason:</span> {rab.excess_dlr_reason}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </TabsContent>

      <TabsContent value="timeline" className="m-0">
        <div className="bg-gray-50/60 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Approval Timeline</p>
          <div className="space-y-1.5">
            {rab.timeline.map((step, i) => {
              const done = !!step.at;
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-1">
                      <span className="font-semibold text-gray-700">{step.role}</span>
                      {step.name && <span className="text-gray-500">· {step.name}</span>}
                    </div>
                    <p className={`text-[11px] ${done ? 'text-gray-600' : 'text-gray-400'}`}>{fmtDate(step.at)}</p>
                    {step.notes && <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-2">&quot;{step.notes}&quot;</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="totalrab" className="m-0">
        {releasedSiblings.length === 0 ? (
          <div className="bg-gray-50/60 rounded-lg p-4 text-center" data-testid={`rab-${rab.rab_number}-totalrab-empty`}>
            <FileText className="h-5 w-5 text-gray-300 mx-auto mb-1" />
            <p className="text-xs text-gray-500">No other released RABs yet.</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Released RABs from this Work Order will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1.5" data-testid={`rab-${rab.rab_number}-totalrab-list`}>
            {releasedSiblings.map((sib) => (
              <div
                key={sib.request_id}
                className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/50 hover:bg-violet-50 px-2.5 py-2 transition"
                data-testid={`totalrab-row-${sib.rab_number}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className="bg-violet-600 text-white border-violet-700 font-bold px-2 py-0.5 text-[10px] shrink-0">
                    {sib.rab_number}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-900 truncate">{sib.stage_name}</p>
                    <p className="text-[10px] text-emerald-700 font-medium">
                      Released {sib.released_at ? `· ${fmtDate(sib.released_at)}` : ''} · {inr(sib.approved_amount)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onView && onView(sib)}
                    data-testid={`totalrab-view-${sib.rab_number}`}
                  >
                    <Eye className="h-3 w-3 mr-1" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onDownload && onDownload(sib)}
                    data-testid={`totalrab-download-${sib.rab_number}`}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

const MiniStat = ({ label, value, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-2">
    <p className="text-[9px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
    <p className={`text-xs sm:text-sm font-bold mt-0.5 ${valueClass || 'text-gray-900'}`}>{value}</p>
  </div>
);

/**
 * Stacked sub-popup that focuses on ONE previously released RAB. Rendered on
 * top of the parent RABDetailDialog so the user can drill into a historic RAB
 * (e.g. RAB-02) without losing their position in RAB-03. Closing this dialog
 * (X icon or Close button) leaves the parent intact.
 *
 * UI is intentionally identical to a single RAB card from the parent — same
 * header (badge/stage/status), same Download button, same Summary + Timeline
 * tabs — minus the "Total RAB's" tab (no further drill-down).
 */
function RABFocusedDialog({ open, rab, inr, fmtDate, onClose, onDownload }) {
  if (!rab) return null;
  const st = STATUS[rab.status] || { label: rab.status || 'Unknown', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  const isApproved = rab.status === 'approved';
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0" data-testid="rab-focused-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-violet-600" />
            {rab.rab_number} — Bill Detail
          </DialogTitle>
          <DialogDescription className="text-xs">
            Released bill snapshot. The parent RAB chain remains open underneath — close this to return.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-3">
          <div className="rounded-lg border border-violet-300 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-violet-600 text-white border-violet-700 font-bold px-2 py-0.5 text-xs">{rab.rab_number}</Badge>
                <span className="text-xs font-semibold text-gray-900">{rab.stage_name}</span>
                <Badge className={`border text-[10px] ${st.cls}`}>{st.label}</Badge>
              </div>
              <div className="flex flex-col items-end text-[10px] leading-tight">
                {rab.timeline?.[0]?.at && (
                  <div className="text-right">
                    <span className="text-gray-500 uppercase tracking-wider font-medium">Requested</span>
                    <p className="text-gray-900 font-semibold text-xs">{fmtDate(rab.timeline[0].at)}</p>
                  </div>
                )}
                {rab.released_at && (
                  <div className="text-right mt-1">
                    <span className="text-emerald-600 uppercase tracking-wider font-medium">Released</span>
                    <p className="text-emerald-700 font-bold text-xs">{fmtDate(rab.released_at)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mb-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!isApproved}
                onClick={() => isApproved && onDownload && onDownload(rab)}
                data-testid={`focused-rab-download-${rab.rab_number}`}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download {rab.rab_number}
              </Button>
            </div>

            {/* Summary + Timeline only (no further drill-down). */}
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="bg-gray-50 p-1 h-auto gap-1 mb-3">
                <TabsTrigger value="summary" className="text-[11px] px-3 py-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white">Summary</TabsTrigger>
                <TabsTrigger value="timeline" className="text-[11px] px-3 py-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white">Timeline</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="m-0">
                <div className="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-3 mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold">Closing Balance After {rab.rab_number}</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-orange-700 mt-0.5">{inr(rab.closing_balance_after)}</p>
                  <p className="text-[10px] text-orange-600/80 mt-0.5">Cumulative released: {inr(rab.cumulative_released_after)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Stage Amount" value={inr(rab.stage_amount)} />
                  <MiniStat label="Requested" value={inr(rab.requested_amount)} />
                  <MiniStat
                    label="Released"
                    value={isApproved ? inr(rab.approved_amount) : '—'}
                    valueClass={isApproved ? 'text-emerald-700' : 'text-gray-400'}
                  />
                </div>
                {rab.notes && (
                  <p className="mt-2 text-[11px] text-gray-600 italic line-clamp-2 border-l-2 border-violet-200 pl-2">&quot;{rab.notes}&quot;</p>
                )}
              </TabsContent>
              <TabsContent value="timeline" className="m-0">
                <div className="bg-gray-50/60 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Approval Timeline</p>
                  <div className="space-y-1.5">
                    {(rab.timeline || []).map((step, i) => {
                      const done = !!step.at;
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <Clock className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-1">
                              <span className="font-semibold text-gray-700">{step.role}</span>
                              {step.name && <span className="text-gray-500">· {step.name}</span>}
                            </div>
                            <p className={`text-[11px] ${done ? 'text-gray-600' : 'text-gray-400'}`}>{fmtDate(step.at)}</p>
                            {step.notes && <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-2">&quot;{step.notes}&quot;</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="rab-focused-close">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default RABDetailDialog;
