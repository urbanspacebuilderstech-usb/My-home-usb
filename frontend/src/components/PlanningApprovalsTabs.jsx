import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Building2, Users, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const PENDING_WITH_CLS = {
  PM: 'bg-blue-100 text-blue-700 border-blue-200',
  QC: 'bg-violet-100 text-violet-700 border-violet-200',
  Planning: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Accountant: 'bg-amber-100 text-amber-700 border-amber-200',
};

// Shows at most 2 lines; if there are more, a "+N more" toggle expands the
// rest in place (click again to collapse) instead of every row stretching
// the whole table to fit its longest pending list.
function PendingItemsCell({ items }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 2);
  const hiddenCount = items.length - 2;

  return (
    <div>
      {visible.map((it, i) => (
        <span key={i} className="block text-xs">
          {it.kind === 'additional_work' && (
            <Badge variant="outline" className="text-[9px] mr-1 bg-orange-50 text-orange-700 border-orange-200">Additional</Badge>
          )}
          {it.stage_name} · {fmtCurrency(it.amount)}
          {it.rab_number ? ` · ${it.rab_number}` : ''}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="text-[11px] text-blue-600 hover:underline mt-0.5"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Show less' : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}

// Read-only cross-project view of every Work Order with a payment request
// (RAB) still in-flight through SE -> PM -> QC -> Planning -> Accountant,
// and which role it's currently sitting with. No approve/reject here —
// that still happens from each role's own queue; this is purely visibility.
function WorkOrderApprovalStatus({ onCountChange }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/planning-head/workorder-approvals`);
      const list = res.data || [];
      setRows(list);
      onCountChange && onCountChange(list.length);
    } catch {
      toast.error('Failed to load Work Order approval status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            Work Order Approvals
            {rows.length > 0 && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">{rows.length} pending</Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={fetchRows} disabled={loading} data-testid="wo-approvals-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8" data-testid="wo-approvals-empty">No Work Orders currently awaiting approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Work Order</th>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Contractor</th>
                  <th className="text-left px-3 py-2">Pending Stage(s)</th>
                  <th className="text-left px-3 py-2">Pending With</th>
                  <th className="text-left px-3 py-2">Since</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.work_order_id} className="border-b hover:bg-blue-50/30" data-testid={`wo-approval-row-${r.work_order_id}`}>
                    <td className="px-3 py-2">
                      <button
                        className="text-blue-700 hover:underline font-medium"
                        onClick={() => navigate(`/projects/${r.project_id}`)}
                      >
                        {r.work_order_number}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.project_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{r.contractor_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <PendingItemsCell items={r.pending_items} />
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${PENDING_WITH_CLS[r.oldest_pending_with] || ''}`}>
                        {r.oldest_pending_with}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">{fmtTime(r.oldest_pending_since)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Read-only view of Final Estimates currently sitting with the CLIENT for
// approval/rejection (status=pending_client_review). The client acts from
// their own portal — this is visibility only, no action buttons.
function ClientPendingApprovals() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/planning-head/final-estimates-client-pending`);
      setProjects(res.data || []);
    } catch {
      toast.error('Failed to load client-pending approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-600" />
            Final Estimate — Waiting on Client
            {projects.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{projects.length} pending</Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={fetchRows} disabled={loading} data-testid="client-approvals-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8" data-testid="client-approvals-empty">No projects currently waiting on client approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Client</th>
                  <th className="text-right px-3 py-2">FE Value</th>
                  <th className="text-left px-3 py-2">Rev</th>
                  <th className="text-left px-3 py-2">Sent to Client</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.project_id} className="border-b hover:bg-emerald-50/30" data-testid={`client-approval-row-${p.project_id}`}>
                    <td className="px-3 py-2">
                      <button
                        className="text-blue-700 hover:underline font-medium"
                        onClick={() => navigate(`/projects/${p.project_id}`)}
                      >
                        {p.name || p.project_id}
                      </button>
                      <p className="text-[11px] text-gray-500">{p.location || ''}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{p.client_name || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmtCurrency(p.total_value)}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">Rev {p.fe?.revision ?? 0}</Badge></td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">{fmtTime(p.fe?.sent_to_client_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Planning Dashboard > Approvals — split into Internal (cross-project Work
// Order approval status) and Client (Final Estimates currently waiting on
// the client) tabs. Pure status views, no approve/reject actions here.
export default function PlanningApprovalsTabs({ onCountChange }) {
  return (
    <Tabs defaultValue="internal">
      <TabsList className="mb-3">
        <TabsTrigger value="internal" className="gap-1.5" data-testid="planning-approvals-internal-tab">
          <Users className="h-3.5 w-3.5" /> Internal
        </TabsTrigger>
        <TabsTrigger value="client" className="gap-1.5" data-testid="planning-approvals-client-tab">
          <Send className="h-3.5 w-3.5" /> Client
        </TabsTrigger>
      </TabsList>
      <TabsContent value="internal" className="space-y-4">
        <WorkOrderApprovalStatus onCountChange={onCountChange} />
      </TabsContent>
      <TabsContent value="client">
        <ClientPendingApprovals />
      </TabsContent>
    </Tabs>
  );
}
