import { useEffect, useState } from 'react';
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Eye, Loader2, FileText, Clock, CheckCircle2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * RAB tab for a Work Order — embedded in ProjectDetail's WO detail view.
 *
 * Sub-tabs:
 *   • All           — every RAB (released, pending, rejected) with display number
 *   • Released RAB  — only approved/released, each row has a View button which
 *                     opens the single-RAB popup (PDF download from there)
 *   • Requested RAB — un-released, in-flight (not approved, not rejected)
 *
 * Uses the same /work-orders/{id}/rab-chain endpoint so numbering matches the
 * SE Payment Summary popup, and skip-rejected sequencing is consistent.
 */
export default function WORABTab({ projectId, workOrder, onOpenRabView }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!projectId || !workOrder?.work_order_id) return;
    setLoading(true);
    axios.get(`${API}/projects/${projectId}/work-orders/${workOrder.work_order_id}/rab-chain`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.detail || 'Failed to load RAB chain'))
      .finally(() => setLoading(false));
  }, [projectId, workOrder?.work_order_id]);

  const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return String(iso).slice(0, 10); }
  };

  const STATUS = {
    requested:          { label: 'Pending PM',         cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    pm_approved:        { label: 'Pending QC',         cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    qc_approved:        { label: 'Pending Planning',   cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    planning_approved:  { label: 'Pending Accountant', cls: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
    approved:           { label: 'Released',           cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected:           { label: 'Rejected',           cls: 'bg-red-100 text-red-700 border-red-200' },
    se_rework:          { label: 'Returned to SE',     cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading RAB chain…
      </div>
    );
  }
  if (err) return <div className="text-sm text-red-600 py-4">{err}</div>;
  if (!data) return null;

  const rabs = data.rabs || [];
  const RELEASED = rabs.filter(r => r.status === 'approved');
  const REJECTED = new Set(['rejected', 'accountant_rejected', 'se_rework_rejected']);
  const REQUESTED = rabs.filter(r => !REJECTED.has(r.status) && r.status !== 'approved');

  const Row = ({ rab, showView, isLast }) => {
    const st = STATUS[rab.status] || { label: rab.status || 'Unknown', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
    return (
      <tr className="hover:bg-gray-50/60" data-testid={`wo-rab-row-${rab.rab_number}`}>
        <td className="px-3 py-2.5">
          <Badge className={`font-bold text-[10px] px-2 py-0.5 ${rab.rab_number === '—' ? 'bg-gray-200 text-gray-500' : 'bg-violet-600 text-white border-violet-700'}`}>
            {rab.rab_number}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-700">{rab.stage_name}</td>
        <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(rab.released_at || (rab.timeline?.[0]?.at))}</td>
        <td className="px-3 py-2.5 text-right text-xs font-medium">{inr(rab.requested_amount)}</td>
        <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-700">
          {rab.status === 'approved' ? inr(rab.approved_amount) : <span className="text-gray-400 font-normal">—</span>}
        </td>
        <td className="px-3 py-2.5 text-right text-xs font-medium text-orange-700">{inr(rab.closing_balance_after)}</td>
        <td className="px-3 py-2.5 text-center">
          <Badge variant="outline" className={`text-[10px] border ${st.cls}`}>{st.label}</Badge>
        </td>
        <td className="px-3 py-2.5 text-right">
          {(showView || isLast) ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px] text-violet-700 border-violet-200 hover:bg-violet-50"
              onClick={() => onOpenRabView && onOpenRabView(rab.request_id)}
              data-testid={`wo-rab-view-${rab.rab_number}`}
            >
              <Eye className="h-3 w-3 mr-1" /> View
            </Button>
          ) : null}
        </td>
      </tr>
    );
  };

  const renderTable = (list, opts = {}) => (
    list.length === 0 ? (
      <div className="py-10 text-center text-sm text-gray-400">
        <FileText className="h-8 w-8 mx-auto text-gray-300 mb-2" />
        {opts.emptyMsg || 'No RABs in this category.'}
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase">RAB</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase">Stage</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase">Date</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Requested</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Released</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Closing Bal</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase">Status</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((r, idx) => (
              <Row
                key={r.request_id}
                rab={r}
                showView={opts.viewAll}
                isLast={opts.lastOnly ? idx === list.length - 1 : opts.viewAll}
              />
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="space-y-3">
      {/* Top summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SumTile label="Contract Total" value={inr(data.contract_total)} accent="text-blue-700" />
        <SumTile label="Total Released" value={inr(data.total_released)} accent="text-emerald-700" />
        <SumTile label="Balance" value={inr(data.balance_after_all)} accent="text-orange-700" />
        <SumTile label="RAB Count" value={`${data.rab_count}`} accent="text-violet-700" />
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full justify-start bg-gray-50 border-b rounded-none h-auto p-0">
          <TabsTrigger value="all" className="text-xs flex items-center gap-1.5 px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-violet-600 rounded-none">
            <FileText className="h-3 w-3" /> All <Badge className="ml-1 bg-violet-100 text-violet-700 border-0 text-[10px]">{rabs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="released" className="text-xs flex items-center gap-1.5 px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none">
            <CheckCircle2 className="h-3 w-3" /> Released RAB <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-0 text-[10px]">{RELEASED.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="requested" className="text-xs flex items-center gap-1.5 px-3 py-2 data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none">
            <Clock className="h-3 w-3" /> Requested RAB <Badge className="ml-1 bg-orange-100 text-orange-700 border-0 text-[10px]">{REQUESTED.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-3">
          {renderTable(rabs, { viewAll: true })}
        </TabsContent>
        <TabsContent value="released" className="mt-3">
          {/* View button only on the latest released RAB, per request — opens
              the single-RAB popup where the PDF download lives. */}
          {renderTable(RELEASED, { lastOnly: true, emptyMsg: 'No released RABs yet.' })}
        </TabsContent>
        <TabsContent value="requested" className="mt-3">
          {renderTable(REQUESTED, { viewAll: true, emptyMsg: 'No pending requests — everything is released or rejected.' })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SumTile = ({ label, value, accent }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-2.5">
    <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</p>
    <p className={`text-sm font-bold mt-0.5 ${accent || 'text-gray-900'}`}>{value}</p>
  </div>
);
