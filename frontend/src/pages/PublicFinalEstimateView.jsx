import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Building2, Phone, MapPin, FileText, Download, CheckCircle2, XCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function PublicFinalEstimateView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [me, setMe] = useState(null);
  const [acting, setActing] = useState(false);
  const [rejectDialog, setRejectDialog] = useState({ open: false, reason: '' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [r, meRes] = await Promise.all([
          axios.get(`${API}/public/fe/${token}`),
          axios.get(`${API}/auth/me`).catch(() => ({ data: null })),
        ]);
        if (!mounted) return;
        // Login-gated FE link (per business rule): if not signed in, redirect
        // to /login?next=/fe/<token> and return here after auth.
        if (!meRes.data) {
          window.location.replace(`/login?next=${encodeURIComponent(`/fe/${token}`)}`);
          return;
        }
        setData(r.data);
        setMe(meRes.data);
      } catch (e) {
        if (mounted) setErr(e.response?.data?.detail || 'Could not load estimate');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  const refresh = async () => {
    try {
      const r = await axios.get(`${API}/public/fe/${token}`);
      setData(r.data);
    } catch { /* ignore */ }
  };

  const handleApprove = async () => {
    if (!window.confirm('Approve this Final Estimate? Once approved, only Super Admin can edit it.')) return;
    setActing(true);
    try {
      await axios.post(`${API}/client-portal/final-estimate/${data.project_id}/approve`, {});
      toast.success('Final Estimate approved');
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Approval failed');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    const reason = rejectDialog.reason.trim();
    if (!reason || reason.length < 3) { toast.error('Please share a brief reason'); return; }
    setActing(true);
    try {
      await axios.post(`${API}/client-portal/final-estimate/${data.project_id}/reject`, { reason });
      toast.success('Sent back to Planning for revision');
      setRejectDialog({ open: false, reason: '' });
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Reject failed');
    } finally {
      setActing(false);
    }
  };

  const handleDownload = () => {
    window.print();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-pulse text-gray-400">Loading…</div>
    </div>
  );

  if (err) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="h-12 w-12 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-red-500" />
          </div>
          <p className="font-medium text-gray-800">Estimate not available</p>
          <p className="text-sm text-gray-500 mt-1">{err}</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 sm:pb-6">
      <div className="bg-white border-b shadow-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-gray-700 truncate">My Home USB</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleDownload} data-testid="fe-download-btn">
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-gray-900 break-words">{data.project_name}</CardTitle>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Final Estimate · Revision {data.revision || 0}</p>
              </div>
              <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">
                Reference Document
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Client</p>
                <p className="font-medium break-words">{data.client_name}</p>
              </div>
              {data.client_phone && (
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                  <p className="font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5 shrink-0" />{data.client_phone}</p>
                </div>
              )}
              {data.location && (
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Location</p>
                  <p className="font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{data.location}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action card — visible only to logged-in clients */}
        {me && me.role === 'client' && data.fe_status && (() => {
          const isApproved = data.fe_status === 'approved' || data.fe_status === 'client_approved';
          const isRejected = data.fe_status === 'feedback_received' || data.fe_status === 'client_rejected';
          if (isApproved) {
            return (
              <Card className="border-emerald-300 bg-emerald-50" data-testid="fe-approval-status-approved">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-emerald-800">You approved this Final Estimate</p>
                    <p className="text-emerald-700 text-xs">Approved on {data.approved_at ? new Date(data.approved_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}. The estimate is now locked and cannot be edited.</p>
                  </div>
                </CardContent>
              </Card>
            );
          }
          if (isRejected) {
            return (
              <Card className="border-amber-300 bg-amber-50" data-testid="fe-approval-status-rejected">
                <CardContent className="p-4 flex items-start gap-3">
                  <XCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm flex-1">
                    <p className="font-semibold text-amber-800">Revision requested</p>
                    <p className="text-amber-700 text-xs">Our planning team has been notified and is preparing a revised estimate for you. You'll receive a fresh notification once the new version is ready.</p>
                  </div>
                </CardContent>
              </Card>
            );
          }
          return (
            <Card className="border-amber-200" data-testid="fe-approval-actions">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-gray-800">Your decision</p>
                <p className="text-xs text-gray-500 mt-0.5">Please review the scope below. Approving will lock this Final Estimate as the final agreement.</p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={handleApprove}
                    disabled={acting}
                    data-testid="fe-approve-btn"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-1.5"
                    onClick={() => setRejectDialog({ open: true, reason: '' })}
                    disabled={acting}
                    data-testid="fe-reject-btn"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-600" /> Scope of Work
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile card list (hidden on sm+) */}
            <div className="sm:hidden divide-y" data-testid="fe-scope-mobile">
              {(data.scope || []).length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">No scope items</p>
              ) : data.scope.map((s, i) => {
                const rate = s.unit_rate ?? s.rate;
                const total = s.total_amount ?? s.total;
                return (
                  <div key={s.scope_id || i} className="px-4 py-3" data-testid={`fe-scope-mobile-row-${i}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="text-[11px] text-gray-400 font-medium shrink-0">#{i + 1}</span>
                        <p className="font-medium text-sm text-gray-900 break-words">{s.item_name || s.name}</p>
                      </div>
                      <p className="font-bold text-amber-700 text-sm shrink-0">{fmt(total)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 pl-5 flex-wrap">
                      <span>Qty: <span className="text-gray-700 font-medium">{s.quantity || '-'}</span></span>
                      <span>Unit: <span className="text-gray-700 font-medium">{s.unit || '-'}</span></span>
                      <span>Rate: <span className="text-gray-700 font-medium">{rate ? fmt(rate) : '-'}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / tablet table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm" data-testid="fe-scope-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data.scope || []).length === 0 ? (
                    <tr><td colSpan="6" className="text-center text-gray-400 p-6">No scope items</td></tr>
                  ) : data.scope.map((s, i) => (
                    <tr key={s.scope_id || i}>
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{s.item_name || s.name}</td>
                      <td className="px-4 py-2 text-right">{s.quantity || '-'}</td>
                      <td className="px-4 py-2 text-gray-500">{s.unit || '-'}</td>
                      <td className="px-4 py-2 text-right">{(s.unit_rate || s.rate) ? fmt(s.unit_rate || s.rate) : '-'}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmt(s.total_amount || s.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td colSpan="5" className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Project Value</td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-amber-700" data-testid="fe-total">{fmt(data.total_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile total (inline, since sticky version is below) */}
            <div className="sm:hidden bg-amber-50 border-t-2 border-amber-200 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Project Value</span>
              <span className="text-base font-bold text-amber-700" data-testid="fe-total-mobile">{fmt(data.total_value)}</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] sm:text-xs text-gray-400 pt-2 pb-2">
          Estimate ref: <span className="font-mono">{data.project_id}</span>
          {data.sent_at && <> · Sent: {new Date(data.sent_at).toLocaleDateString()}</>}
        </p>
      </div>

      {/* Sticky total bar — mobile only */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Project Value</p>
            <p className="text-lg font-bold text-amber-700" data-testid="fe-total-sticky">{fmt(data.total_value)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Reject reason dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => !acting && setRejectDialog(r => ({ ...r, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-rose-600" /> Reject Final Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-gray-500">Tell our planning team what needs to change. They'll prepare a revised estimate based on your feedback.</p>
            <Textarea
              placeholder="e.g. Please remove the additional car parking. Increase the kitchen scope."
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog(r => ({ ...r, reason: e.target.value }))}
              rows={4}
              data-testid="reject-reason-input"
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, reason: '' })} disabled={acting}>Cancel</Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleReject}
              disabled={acting || rejectDialog.reason.trim().length < 3}
              data-testid="reject-submit-btn"
            >
              {acting ? 'Sending…' : 'Send Feedback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
