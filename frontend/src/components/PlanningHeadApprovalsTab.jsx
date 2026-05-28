import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CheckCircle2, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

export default function PlanningHeadApprovalsTab({ onCountChange }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/planning-head/final-estimates`);
      const list = res.data || [];
      setProjects(list);
      const pendingCount = list.filter(p => p?.fe?.status === 'pending_planning_head_review').length;
      onCountChange && onCountChange(pendingCount);
    } catch {
      toast.error('Failed to load Final Estimate queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (projectId) => {
    if (!window.confirm('Approve this Final Estimate and forward to GM?')) return;
    try {
      setActing(projectId);
      await axios.post(`${API}/planning-head/projects/${projectId}/final-estimate/approve`, {});
      toast.success('Approved — sent to GM');
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Approve failed');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (projectId) => {
    const reason = window.prompt('Reason for rejecting this Final Estimate?');
    if (!reason || !reason.trim()) return;
    try {
      setActing(projectId);
      await axios.post(`${API}/planning-head/projects/${projectId}/final-estimate/reject`, { reason: reason.trim() });
      toast.success('Rejected — sent back to Planning Person');
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Reject failed');
    } finally {
      setActing(null);
    }
  };

  const pending = projects.filter(p => p?.fe?.status === 'pending_planning_head_review');
  const rejected = projects.filter(p => p?.fe?.status === 'rejected_by_planning_head');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-600" />
              Final Estimate Approvals
              {pending.length > 0 && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200">{pending.length} pending</Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchQueue} disabled={loading} data-testid="fe-approvals-refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8" data-testid="fe-approvals-empty">No Final Estimates awaiting your review.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Project</th>
                    <th className="text-left px-3 py-2">Client</th>
                    <th className="text-right px-3 py-2">FE Value</th>
                    <th className="text-left px-3 py-2">Rev</th>
                    <th className="text-left px-3 py-2">Submitted</th>
                    <th className="text-center px-3 py-2 w-56">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(p => (
                    <tr key={p.project_id} className="border-b hover:bg-amber-50/30" data-testid={`fe-approval-row-${p.project_id}`}>
                      <td className="px-3 py-2">
                        <button
                          className="text-blue-700 hover:underline font-medium"
                          onClick={() => navigate(`/projects/${p.project_id}`)}
                          data-testid={`fe-approval-open-${p.project_id}`}
                        >
                          {p.name || p.project_id}
                        </button>
                        <p className="text-[11px] text-gray-500">{p.location || ''}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{p.client_name || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-amber-700">{fmtCurrency(p.total_value)}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">Rev {p.fe?.revision ?? 0}</Badge></td>
                      <td className="px-3 py-2 text-[11px] text-gray-500">{fmtTime(p.fe?.saved_by_planning_person_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 h-8"
                            onClick={() => handleApprove(p.project_id)}
                            disabled={acting === p.project_id}
                            data-testid={`fe-approval-approve-${p.project_id}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-1 h-8"
                            onClick={() => handleReject(p.project_id)}
                            disabled={acting === p.project_id}
                            data-testid={`fe-approval-reject-${p.project_id}`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rejected.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Previously Rejected
              <Badge variant="outline" className="text-[10px]">{rejected.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Project</th>
                    <th className="text-left px-3 py-2">Client</th>
                    <th className="text-right px-3 py-2">FE Value</th>
                    <th className="text-left px-3 py-2">Last Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rejected.map(p => {
                    const last = (p.fe?.planning_head_rejections || []).slice(-1)[0];
                    return (
                      <tr key={p.project_id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <button
                            className="text-blue-700 hover:underline font-medium"
                            onClick={() => navigate(`/projects/${p.project_id}`)}
                          >
                            {p.name || p.project_id}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{p.client_name || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-700">{fmtCurrency(p.total_value)}</td>
                        <td className="px-3 py-2 text-xs text-rose-700 italic">"{last?.reason || '—'}"</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
