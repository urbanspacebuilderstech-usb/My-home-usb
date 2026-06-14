import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Eye, Loader2, FileText, Clock, CheckCircle2, Search, X, ShieldCheck, Wallet, AlertCircle, RotateCcw, ClipboardCheck, Trash2 } from 'lucide-react';

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
  // Tracks the request_id currently being deleted so we can disable just
  // that row's trash button while the request is in flight.
  const [deletingId, setDeletingId] = useState(null);
  // Free-text filter on stage name. Acts as a searchable dropdown — typing
  // narrows down which stage cards remain visible. The "select" mode (click
  // a chip) jumps straight to that stage card.
  const [stageQuery, setStageQuery] = useState('');
  const [stageOpen, setStageOpen] = useState(false);

  const reloadChain = () => {
    if (!projectId || !workOrder?.work_order_id) return;
    setLoading(true);
    axios.get(`${API}/projects/${projectId}/work-orders/${workOrder.work_order_id}/rab-chain`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.detail || 'Failed to load RAB chain'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reloadChain(); /* eslint-disable-next-line */ }, [projectId, workOrder?.work_order_id]);

  // Delete a single RAB row. Backend rejects deletions of Accountant-released
  // RABs — those must be reversed via the cashbook first. The cascade purge
  // also drops any linked expense / cashbook entries.
  const deleteRab = async (rab) => {
    const amt = (rab.approved_amount || rab.requested_amount || 0).toLocaleString('en-IN');
    if (!window.confirm(`Delete ${rab.rab_number || 'this RAB'} (₹${amt})?\n\nThis will also purge any linked expense and cashbook rows. Cannot be undone.`)) return;
    setDeletingId(rab.request_id);
    try {
      const r = await axios.delete(`${API}/projects/${projectId}/work-orders/${workOrder.work_order_id}/stages/${rab.stage_id}/payment-requests/${rab.request_id}`);
      const p = r.data?.purged || {};
      const cleaned = [
        p.recorded_expenses ? `${p.recorded_expenses} expense` : null,
        p.labour_expenses ? `${p.labour_expenses} labour-exp` : null,
        p.cashbook_entries ? `${p.cashbook_entries} cashbook` : null,
      ].filter(Boolean).join(' · ');
      toast.success(cleaned ? `${rab.rab_number || 'RAB'} deleted · cleaned ${cleaned}` : `${rab.rab_number || 'RAB'} deleted`);
      reloadChain();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return String(iso).slice(0, 10); }
  };

  // Status descriptor — each entry doubles as the data for the row-end
  // pill card: label, palette and a contextual icon that hints at the
  // next approval owner.
  const STATUS = {
    requested:          { label: 'Pending PM',         cls: 'bg-amber-100 text-amber-800 border-amber-300',   Icon: Clock },
    pm_approved:        { label: 'Pending QC',         cls: 'bg-blue-100 text-blue-800 border-blue-300',      Icon: ClipboardCheck },
    qc_approved:        { label: 'Pending Planning',   cls: 'bg-violet-100 text-violet-800 border-violet-300', Icon: ShieldCheck },
    planning_approved:  { label: 'Pending Accountant', cls: 'bg-cyan-100 text-cyan-800 border-cyan-300',      Icon: Wallet },
    approved:           { label: 'Released',           cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
    rejected:           { label: 'Rejected',           cls: 'bg-red-100 text-red-800 border-red-300',         Icon: AlertCircle },
    se_rework:          { label: 'Returned to SE',     cls: 'bg-orange-100 text-orange-800 border-orange-300', Icon: RotateCcw },
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

  // Group every RAB by its stage. Stage meta (name + total amount) comes
  // from the rab payload itself — backend already enriches each row.
  const groupByStage = (list) => {
    const map = new Map();
    list.forEach((r) => {
      const sid = r.stage_id || '__no_stage__';
      if (!map.has(sid)) {
        map.set(sid, {
          stage_id: sid,
          stage_name: r.stage_name || 'Stage',
          stage_amount: r.stage_amount || 0,
          rabs: [],
        });
      }
      map.get(sid).rabs.push(r);
    });
    // Sort each group's rabs by request time (chronological RAB numbering).
    map.forEach(g => g.rabs.sort((a, b) => (a.timeline?.[0]?.at || '').localeCompare(b.timeline?.[0]?.at || '')));
    return Array.from(map.values());
  };

  // Aggregate three rollups per stage: total released, sum of pending
  // (in-flight, not yet released), and the remaining stage balance.
  const decorateTotals = (group) => {
    const released = group.rabs.filter(r => r.status === 'approved').reduce((s, r) => s + (r.approved_amount || 0), 0);
    const pending = group.rabs.filter(r => !REJECTED.has(r.status) && r.status !== 'approved').reduce((s, r) => s + (r.requested_amount || 0), 0);
    return { ...group, released, pending, balance: (group.stage_amount || 0) - released - pending };
  };

  // Unique stage list across the full ladder — powers the dropdown chips.
  // Computed inline (cheap) so we don't have to hoist a useMemo above the
  // early returns above.
  const stageOptions = (() => {
    const seen = new Map();
    (data?.rabs || []).forEach(r => {
      if (r.stage_id && !seen.has(r.stage_id)) seen.set(r.stage_id, r.stage_name || 'Stage');
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  })();

  const matchesStageFilter = (g) => {
    if (!stageQuery.trim()) return true;
    return (g.stage_name || '').toLowerCase().includes(stageQuery.trim().toLowerCase());
  };

  const Row = ({ rab, showView, isLast }) => {
    const st = STATUS[rab.status] || { label: rab.status || 'Unknown', cls: 'bg-gray-100 text-gray-700 border-gray-200', Icon: AlertCircle };
    const StatusIcon = st.Icon || AlertCircle;
    const isMulti = rab.is_multi_stage && Array.isArray(rab.stage_breakdown) && rab.stage_breakdown.length > 1;
    return (
      <>
      <tr className="hover:bg-gray-50/60" data-testid={`wo-rab-row-${rab.rab_number}`}>
        <td className="px-3 py-2.5">
          <Badge className={`font-bold text-[10px] px-2 py-0.5 ${rab.rab_number === '—' ? 'bg-gray-200 text-gray-500' : 'bg-violet-600 text-white border-violet-700'}`}>
            {rab.rab_number}
          </Badge>
          {isMulti && (
            <span className="ml-1 text-[9px] uppercase font-semibold text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded px-1.5 py-0.5 align-middle">
              {rab.stage_breakdown.length}-stage bill
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(rab.released_at || (rab.timeline?.[0]?.at))}</td>
        <td className="px-3 py-2.5 text-right text-xs font-medium">{inr(rab.requested_amount)}</td>
        <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-700">
          {rab.status === 'approved' ? inr(rab.approved_amount) : <span className="text-gray-400 font-normal">—</span>}
        </td>
        <td className="px-3 py-2.5 text-right text-xs font-medium text-orange-700">{inr(rab.closing_balance_after)}</td>
        <td className="px-3 py-2.5 text-right">
          <div className="inline-flex items-center gap-1">
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
            {rab.status === 'requested' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => deleteRab(rab)}
                disabled={deletingId === rab.request_id}
                title={`Delete ${rab.rab_number || 'RAB'}`}
                data-testid={`wo-rab-delete-${rab.rab_number}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border-2 text-[11px] font-semibold whitespace-nowrap shadow-sm ${st.cls}`}
            data-testid={`wo-rab-status-pill-${rab.rab_number}`}
          >
            <StatusIcon className="h-3.5 w-3.5" /> {st.label}
          </span>
        </td>
      </tr>
      {isMulti && (
        <tr className="bg-fuchsia-50/40">
          <td colSpan={7} className="px-3 py-2 border-t border-fuchsia-100">
            <p className="text-[10px] uppercase font-semibold text-fuchsia-700 mb-1">Stages covered by this bill</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {rab.stage_breakdown.map((sb, idx) => (
                <div key={sb.request_id || idx} className="flex items-center justify-between gap-2 bg-white rounded border border-fuchsia-100 px-2 py-1">
                  <span className="text-[11px] font-medium text-slate-700 truncate" title={sb.stage_name}>{idx + 1}. {sb.stage_name}</span>
                  <span className="text-[11px] font-bold text-emerald-700">{inr(sb.requested_amount)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
      </>
    );
  };

  const renderTable = (list, opts = {}) => (
    list.length === 0 ? null : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase">RAB</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase">Date</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Requested</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Released</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Closing Bal</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Action</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((r) => (
              <Row key={r.request_id} rab={r} showView={true} isLast={true} />
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  // Per-stage card — header row with name + three stat tiles (Total /
  // Released / Balance), inner table of RABs that pass the active sub-tab
  // filter, and a fallback empty hint when this stage has no matching RABs.
  const StageCard = ({ group, scopedRabs }) => {
    const decorated = decorateTotals(group);
    return (
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm" data-testid={`worab-stage-card-${decorated.stage_id}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-violet-50/40 to-white">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold">Stage</p>
            <p className="text-sm font-bold text-gray-900 truncate">{decorated.stage_name}</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:w-[420px] shrink-0">
            <Tile label="Total" value={inr(decorated.stage_amount)} color="text-blue-700" />
            <Tile label="Released" value={inr(decorated.released)} color="text-emerald-700" />
            <Tile label="Balance" value={inr(decorated.balance)} color={decorated.balance < 0 ? 'text-red-700' : 'text-orange-700'} />
          </div>
        </div>
        {scopedRabs.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-gray-400">No RABs in this view for this stage.</p>
        ) : renderTable(scopedRabs)}
      </div>
    );
  };

  // Build & filter the grouped layout for one of the three sub-tab buckets.
  const renderGrouped = (sourceList, emptyMsg) => {
    const allGroups = groupByStage(rabs).map(decorateTotals);
    const sourceIds = new Set(sourceList.map(r => r.stage_id || '__no_stage__'));
    const visibleGroups = allGroups
      .filter(g => sourceIds.has(g.stage_id))
      .filter(matchesStageFilter);
    if (visibleGroups.length === 0) {
      return (
        <div className="py-10 text-center text-sm text-gray-400">
          <FileText className="h-8 w-8 mx-auto text-gray-300 mb-2" />
          {stageQuery.trim() ? `No stages match "${stageQuery}"` : emptyMsg}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {visibleGroups.map(g => (
          <StageCard key={g.stage_id} group={g} scopedRabs={g.rabs.filter(r => sourceList.includes(r))} />
        ))}
      </div>
    );
  };

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

        {/* Searchable Stage filter — type-ahead text input that narrows the
            stage cards below. The chip popover surfaces every distinct stage
            in this WO and acts like a dropdown when clicked. */}
        <div className="mt-3 relative" data-testid="worab-stage-filter">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <Input
              value={stageQuery}
              onChange={(e) => setStageQuery(e.target.value)}
              onFocus={() => setStageOpen(true)}
              onBlur={() => setTimeout(() => setStageOpen(false), 150)}
              placeholder="Search stage — type to filter cards"
              className="h-9 text-xs pl-8 pr-8"
              data-testid="worab-stage-search"
            />
            {stageQuery && (
              <button
                type="button"
                onClick={() => setStageQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                data-testid="worab-stage-clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Popover suggestion list shows only when the input has focus AND
              there are stages that match the typed query. */}
          {stageOpen && (
            <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
              {stageOptions
                .filter(o => !stageQuery.trim() || o.name.toLowerCase().includes(stageQuery.trim().toLowerCase()))
                .slice(0, 30)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setStageQuery(o.name); setStageOpen(false); }}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 hover:text-violet-700"
                    data-testid={`worab-stage-option-${o.id}`}
                  >
                    {o.name}
                  </button>
                ))}
              {stageOptions.filter(o => !stageQuery.trim() || o.name.toLowerCase().includes(stageQuery.trim().toLowerCase())).length === 0 && (
                <p className="px-3 py-2 text-[11px] text-gray-400">No stages match.</p>
              )}
            </div>
          )}
        </div>

        <TabsContent value="all" className="mt-3">
          {renderGrouped(rabs, 'No RABs requested on this WO yet.')}
        </TabsContent>
        <TabsContent value="released" className="mt-3">
          {renderGrouped(RELEASED, 'No released RABs yet.')}
        </TabsContent>
        <TabsContent value="requested" className="mt-3">
          {renderGrouped(REQUESTED, 'No pending requests — everything is released or rejected.')}
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

/** Compact 3-up stat tile for the per-stage card header. */
const Tile = ({ label, value, color }) => (
  <div className="rounded border border-gray-200 bg-white px-2 py-1 text-center">
    <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
    <p className={`text-xs font-bold ${color || 'text-gray-900'}`}>{value}</p>
  </div>
);
