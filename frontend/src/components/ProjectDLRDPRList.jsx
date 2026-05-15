// Overall DLR & DPR submissions for a project (read-only list shown in SE DLR & DPR tab)
import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Users, IndianRupee, ClipboardList, FileText, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const typeLabel = (t) => {
  if (t === 'semi_skilled') return 'Semi-Skilled';
  return t?.charAt(0).toUpperCase() + t?.slice(1);
};

const ProjectDLRDPRList = ({ projectId }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState('');

  const fetchEntries = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const params = filterDate ? `?date=${filterDate}` : '';
      // Reuse summary endpoint — it returns flat `entries` list of all DLRs for the project
      const res = await axios.get(`${API}/projects/${projectId}/dlr/summary${params}`);
      setEntries(res.data?.entries || []);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); /* eslint-disable-next-line */ }, [projectId, filterDate]);

  return (
    <div className="rounded-xl border bg-white" data-testid="project-dlr-dpr-list">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 border-b bg-gray-50/60 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">DLR &amp; DPR Submissions ({entries.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-gray-400" />
          <Input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="h-8 text-xs w-[140px]"
            data-testid="dlr-dpr-list-date-filter"
          />
          {filterDate && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterDate('')}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <p className="text-center text-gray-400 text-xs py-6">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 px-4">
          <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No DLR &amp; DPR entries{filterDate ? ` for ${filterDate}` : ' submitted yet'}</p>
          <p className="text-[11px] text-gray-400 mt-1">Open the Work Order tab and click <span className="font-semibold">+ DLR</span> to submit one.</p>
        </div>
      ) : (
        <div className="divide-y">
          {entries.map((e) => (
            <div key={e.dlr_id} className="px-3 sm:px-4 py-3" data-testid={`dlr-dpr-row-${e.dlr_id}`}>
              {/* Top row: date + contractor + workers + cost */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-teal-600" />
                  <span className="text-xs font-semibold text-gray-900">{e.date}</span>
                  <span className="text-[11px] text-gray-400">•</span>
                  <span className="text-xs text-gray-700">{e.contractor_name || '—'}</span>
                  {e.stage_name && (
                    <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">Stage: {e.stage_name}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    <Users className="h-2.5 w-2.5 mr-0.5" />{e.total_workers || 0} workers
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-teal-700">
                    <IndianRupee className="h-2.5 w-2.5 mr-0.5" />{fmt(e.total_cost)}
                  </Badge>
                </div>
              </div>

              {/* Labour split */}
              {Array.isArray(e.entries) && e.entries.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {e.entries.map((r, i) => (
                    <span key={i} className="text-[10px] bg-gray-50 border rounded px-1.5 py-0.5 text-gray-700">
                      {typeLabel(r.type)}: <span className="font-semibold">{r.count}</span> × {r.day_value} day
                    </span>
                  ))}
                </div>
              )}

              {/* Work Summary (DPR) */}
              {e.work_summary && (
                <p className="mt-1.5 text-[11px] text-gray-700 bg-emerald-50/40 border border-emerald-100 rounded px-2 py-1.5">
                  <span className="font-semibold text-emerald-700">Work Summary:</span> {e.work_summary}
                </p>
              )}

              {/* Notes */}
              {e.notes && (
                <p className="mt-1 text-[11px] text-gray-500 italic">Note: {e.notes}</p>
              )}

              {/* Created by */}
              <p className="mt-1 text-[10px] text-gray-400">
                By {e.created_by_name || '—'} · {e.created_at ? new Date(e.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectDLRDPRList;
