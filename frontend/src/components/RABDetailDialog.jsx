import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
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
  ShieldCheck,
  KeyRound,
  Mail,
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
  const [otpForRab, setOtpForRab] = useState(null); // { rab, ... } when OTP gate is open
  const [focusedRab, setFocusedRab] = useState(null); // stacked single-RAB sub-popup

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
                        onClick={() => {
                          if (rab.status !== 'approved') return;
                          setOtpForRab(rab);
                        }}
                        title={rab.status !== 'approved' ? 'Available after Accountant release' : 'Requires Planning OTP — click to verify and download'}
                        data-testid={`rab-download-${rab.rab_number}`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-violet-600" />
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download {rab.rab_number}
                      </Button>
                    </div>

                    {/* Summary / Timeline / Total RAB's inner tabs */}
                    <RABCardTabs
                      rab={rab}
                      inr={inr}
                      fmtDate={fmtDate}
                      releasedSiblings={(data.rabs || []).filter(r => r.status === 'approved' && r.request_id !== rab.request_id)}
                      onView={(target) => setFocusedRab(target)}
                      onDownload={(target) => setOtpForRab(target)}
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
      <RabDownloadOtpDialog
        open={!!otpForRab}
        rab={otpForRab}
        projectId={projectId}
        workOrderId={workOrderId}
        contractorName={data?.contractor_name}
        onClose={() => setOtpForRab(null)}
      />
      {/* Stacked sub-popup for a single focused (released) RAB. Parent dialog
          stays mounted underneath so the user can dismiss this view and pick
          another previous RAB without losing context. */}
      <RABFocusedDialog
        open={!!focusedRab}
        rab={focusedRab}
        inr={inr}
        fmtDate={fmtDate}
        onClose={() => setFocusedRab(null)}
        onDownload={(target) => setOtpForRab(target)}
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
function RABCardTabs({ rab, inr, fmtDate, releasedSiblings = [], onView, onDownload }) {
  const isApproved = rab.status === 'approved';
  return (
    <Tabs defaultValue="summary" className="w-full">
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
                    <ShieldCheck className="h-3 w-3 mr-1 text-violet-600" />
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
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-violet-600" />
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

/**
 * Phase 2 OTP gate. Pops up over the RAB detail dialog when the user clicks
 * Download on an approved RAB. Two-step flow:
 *   1. Request OTP — emails a 6-digit code to the Planning user who approved
 *      this RAB. The downloader obtains the code from Planning out-of-band.
 *   2. Verify & Download — submits the OTP to /pdf?otp=XXXXXX which returns
 *      the signed PDF on success.
 */
function RabDownloadOtpDialog({ open, rab, projectId, workOrderId, contractorName, onClose }) {
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [planningInfo, setPlanningInfo] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) {
      setOtp(''); setSending(false); setSent(false); setPlanningInfo(null); setVerifying(false);
    }
  }, [open]);

  if (!rab) return null;

  const requestOtp = async () => {
    setSending(true);
    try {
      const r = await axios.post(
        `${API}/projects/${projectId}/work-orders/${workOrderId}/rabs/${rab.request_id}/download-otp/send`
      );
      setSent(true);
      setPlanningInfo(r.data);
      toast.success(r.data?.message || 'OTP sent to Planning');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setSending(false);
    }
  };

  const verifyAndDownload = async () => {
    const code = (otp || '').trim();
    if (code.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }
    setVerifying(true);
    try {
      const r = await fetch(
        `${API}/projects/${projectId}/work-orders/${workOrderId}/rabs/${rab.request_id}/pdf?otp=${encodeURIComponent(code)}`,
        { credentials: 'include' }
      );
      if (!r.ok) {
        let msg = 'Download failed';
        try { const j = await r.json(); msg = j.detail || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rab.rab_number || 'RAB'}_${(contractorName || 'vendor').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${rab.rab_number} downloaded`);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Invalid or expired OTP');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="rab-otp-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            Planning OTP Required
          </DialogTitle>
          <DialogDescription className="text-xs">
            Downloading the signed <strong className="text-violet-700">{rab.rab_number}</strong> bill requires
            a one-time code from Planning. This protects released bills from unauthorised distribution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Step 1 — request OTP */}
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-800">
                <Mail className="h-3.5 w-3.5" /> Step 1 — Request OTP from Planning
              </div>
              {sent && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Sent</Badge>}
            </div>
            <Button
              size="sm"
              variant={sent ? 'outline' : 'default'}
              className={sent ? '' : 'bg-violet-600 hover:bg-violet-700 text-white'}
              onClick={requestOtp}
              disabled={sending}
              data-testid="rab-otp-send-btn"
            >
              {sending ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…</>)
                : sent ? 'Resend OTP'
                : (<><Mail className="h-3.5 w-3.5 mr-1.5" /> Send OTP to Planning</>)}
            </Button>
            {sent && planningInfo && (
              <p className="text-[11px] text-violet-700 mt-2">
                {planningInfo.message}{planningInfo.planning_name ? ` — ${planningInfo.planning_name}` : ''}
              </p>
            )}
          </div>

          {/* Step 2 — enter & verify */}
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 mb-2">
              <KeyRound className="h-3.5 w-3.5 text-gray-600" /> Step 2 — Enter the 6-digit code
            </div>
            <Input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              className="text-center font-mono text-lg tracking-[0.4em]"
              data-testid="rab-otp-input"
            />
            <p className="text-[10px] text-gray-500 mt-1">OTP is valid for 10 minutes and can be used only once.</p>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="rab-otp-cancel">Cancel</Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={verifying || (otp || '').length !== 6}
            onClick={verifyAndDownload}
            data-testid="rab-otp-verify-btn"
          >
            {verifying ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Verifying…</>)
              : (<><Download className="h-3.5 w-3.5 mr-1.5" /> Verify & Download</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RABDetailDialog;
