import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  Download
} from 'lucide-react';

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

  const STATUS = {
    requested:          { label: 'Pending PM',        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    pm_approved:        { label: 'Pending QC',        cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    qc_approved:        { label: 'Pending Planning',  cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    planning_approved:  { label: 'Pending Accountant',cls: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
    approved:           { label: 'Released',          cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected:           { label: 'Rejected',          cls: 'bg-red-100 text-red-700 border-red-200' },
    se_rework:          { label: 'Returned to SE',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="rab-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-600" />
            RAB Bill Detail
          </DialogTitle>
          <DialogDescription>
            Running Account Bill history for this Work Order — every payment request, its approval timeline, and the running closing balance.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading RAB chain...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            <AlertTriangle className="h-4 w-4 inline mr-1" /> {error}
          </div>
        )}

        {data && (
          <>
            {/* Header summary */}
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-violet-50/20 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile icon={Building2} label="Vendor" value={data.contractor_name || '—'} accent="text-violet-700" />
                <Tile icon={Hash}      label="Work Order" value={data.work_order_number || data.work_order_id?.slice(0, 8)} accent="text-violet-700" />
                <Tile icon={IndianRupee} label="Contract Total" value={inr(data.contract_total)} accent="text-blue-700" />
                <Tile icon={CheckCircle2} label="Released So Far" value={inr(data.total_released)} accent="text-emerald-700" />
              </div>
              <div className="mt-3 pt-3 border-t border-violet-100 grid grid-cols-2 gap-3">
                <Tile icon={Clock} label="Balance Remaining" value={inr(data.balance_after_all)} accent="text-orange-700" />
                <Tile icon={FileText} label="Total RABs" value={`${data.rab_count}`} accent="text-gray-900" />
              </div>
              {data.scope_of_work && (
                <p className="text-xs text-gray-600 mt-3 italic line-clamp-2">{data.scope_of_work}</p>
              )}
            </div>

            {/* Per-RAB cards */}
            <div className="space-y-3 mt-4" data-testid="rab-detail-list">
              {data.rabs.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <FileText className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                  <p>No RAB raised yet for this Work Order.</p>
                </div>
              ) : data.rabs.map((rab) => {
                const st = STATUS[rab.status] || { label: rab.status || 'Unknown', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
                const isHighlighted = highlightRequestId && rab.request_id === highlightRequestId;
                return (
                  <div
                    key={rab.request_id}
                    className={`rounded-xl border p-4 transition-all ${
                      isHighlighted
                        ? 'border-violet-400 bg-violet-50/40 ring-2 ring-violet-200'
                        : 'border-gray-200 bg-white hover:border-violet-200'
                    }`}
                    data-testid={`rab-card-${rab.rab_number || rab.request_id}`}
                  >
                    {/* RAB header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-violet-600 text-white border-violet-700 font-bold px-2.5 py-1">
                          {rab.rab_number}
                        </Badge>
                        <span className="text-sm font-semibold text-gray-900">{rab.stage_name}</span>
                        <Badge className={`border ${st.cls}`}>{st.label}</Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rab.status !== 'approved'}
                        onClick={async () => {
                          if (rab.status !== 'approved') return;
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
                            a.download = `${rab.rab_number || 'RAB'}_${(data.contractor_name || 'vendor').replace(/\s+/g, '_')}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            // Fallback to opening in a tab
                            window.open(
                              `${API}/projects/${projectId}/work-orders/${workOrderId}/rabs/${rab.request_id}/pdf`,
                              '_blank'
                            );
                          }
                        }}
                        title={rab.status !== 'approved' ? 'Available after Accountant release' : 'Download RAB bill (PDF)'}
                        data-testid={`rab-download-${rab.rab_number}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download {rab.rab_number}
                      </Button>
                    </div>

                    {/* Amounts grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <SmallTile label="Stage Amount" value={inr(rab.stage_amount)} />
                      <SmallTile label="Requested" value={inr(rab.requested_amount)} />
                      <SmallTile
                        label="Released"
                        value={rab.status === 'approved' ? inr(rab.approved_amount) : '—'}
                        valueClass={rab.status === 'approved' ? 'text-emerald-700' : 'text-gray-400'}
                      />
                      <SmallTile
                        label="Closing Balance"
                        value={inr(rab.closing_balance_after)}
                        valueClass="text-orange-700"
                      />
                    </div>

                    {/* Approval timeline */}
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
                                {step.notes && <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-2">"{step.notes}"</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

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

            {/* Footer summary */}
            <div className="mt-4 rounded-xl bg-violet-600 text-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FooterTile label="Contract Total" value={inr(data.contract_total)} />
              <FooterTile label="Total Released" value={inr(data.total_released)} />
              <FooterTile label="Balance" value={inr(data.balance_after_all)} />
              <FooterTile label="RAB Count" value={`${data.rab_count}`} />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="rab-detail-close">Close</Button>
        </DialogFooter>
      </DialogContent>
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

export default RABDetailDialog;
