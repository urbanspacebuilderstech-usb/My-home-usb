import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Hammer, Calendar, CheckCircle2, Clock, RotateCcw, ArrowLeft, Search,
  Building2, Phone, MapPin, RefreshCw,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_BADGE = {
  pending:   { cls: 'bg-gray-100 text-gray-700 border-gray-200',   label: 'Pending' },
  scheduled: { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Scheduled' },
  completed: { cls: 'bg-green-100 text-green-700 border-green-200', label: 'Completed' },
};

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '-';
  }
};

const toLocalInputValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local needs YYYY-MM-DDTHH:mm in local TZ
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CREPreConstruction() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [data, setData] = useState({ stages: [], counts: {}, total_projects: 0, rows: null });
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState(searchParams.get('stage') || null);
  const [search, setSearch] = useState('');
  const [scheduleDialog, setScheduleDialog] = useState({ open: false, project: null, value: '', submitting: false });

  const fetchData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [meRes, listRes] = await Promise.all([
        axios.get(`${API}/auth/me`).catch(() => null),
        axios.get(`${API}/cre/pre-construction`, { params: activeStage ? { stage: activeStage } : {} }),
      ]);
      if (meRes?.data) setUser(meRes.data);
      setData(listRes.data || {});
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Access denied');
        navigate('/dashboard');
      } else {
        toast.error(err.response?.data?.detail || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeStage]);

  const handleStageClick = (key) => {
    setActiveStage(key);
    setSearchParams(key ? { stage: key } : {});
  };
  const handleBackToOverview = () => {
    setActiveStage(null);
    setSearchParams({});
  };

  const filteredRows = useMemo(() => {
    if (!data.rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.client_name || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q) ||
      (r.project_code || '').toLowerCase().includes(q)
    );
  }, [data.rows, search]);

  const updateStage = async (projectId, stageKey, payload) => {
    try {
      await axios.patch(`${API}/cre/pre-construction/${projectId}/${stageKey}`, payload);
      toast.success('Updated');
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Update failed');
    }
  };

  const openSchedule = (row) => {
    setScheduleDialog({
      open: true,
      project: row,
      value: toLocalInputValue(row.scheduled_at),
      submitting: false,
    });
  };
  const submitSchedule = async () => {
    if (!scheduleDialog.value) {
      toast.error('Pick a date and time');
      return;
    }
    setScheduleDialog((d) => ({ ...d, submitting: true }));
    try {
      // Convert local datetime-local to ISO string
      const iso = new Date(scheduleDialog.value).toISOString();
      await axios.patch(
        `${API}/cre/pre-construction/${scheduleDialog.project.project_id}/${scheduleDialog.project.stage}`,
        { scheduled_at: iso, status: 'scheduled' },
      );
      toast.success('Scheduled');
      setScheduleDialog({ open: false, project: null, value: '', submitting: false });
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to schedule');
      setScheduleDialog((d) => ({ ...d, submitting: false }));
    }
  };

  const stageMeta = data.stages?.find(s => s.key === activeStage);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {activeStage && (
              <Button variant="outline" size="sm" onClick={handleBackToOverview} data-testid="pc-back-btn">
                <ArrowLeft className="h-4 w-4 mr-1" /> All Stages
              </Button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Hammer className="h-6 w-6 text-amber-600" />
                Pre-Construction
                {activeStage && stageMeta && (
                  <span className="text-base sm:text-lg text-gray-500 font-normal">— {stageMeta.label}</span>
                )}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {activeStage
                  ? `All ${data.total_projects} projects · click Schedule or Completed for each`
                  : `Track parallel pre-construction tasks across ${data.total_projects} projects`}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchData(false)} data-testid="pc-refresh-btn">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {loading ? (
          <Card><CardContent className="p-12 text-center text-gray-400">
            <RefreshCw className="h-6 w-6 animate-spin inline mr-2" /> Loading…
          </CardContent></Card>
        ) : !activeStage ? (
          /* OVERVIEW — stage cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="pc-stage-grid">
            {data.stages?.map(stage => {
              const c = data.counts?.[stage.key] || { pending: 0, scheduled: 0, completed: 0 };
              const total = c.pending + c.scheduled + c.completed;
              const pct = total ? Math.round((c.completed / total) * 100) : 0;
              return (
                <Card
                  key={stage.key}
                  className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-amber-400"
                  onClick={() => handleStageClick(stage.key)}
                  data-testid={`pc-stage-card-${stage.key}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{stage.label}</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">{total} projects</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700 text-[11px] shrink-0">{pct}% done</Badge>
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-base font-bold text-gray-700">{c.pending}</p>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">Pending</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-amber-700">{c.scheduled}</p>
                        <p className="text-[10px] uppercase tracking-wide text-amber-600">Scheduled</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-green-700">{c.completed}</p>
                        <p className="text-[10px] uppercase tracking-wide text-green-600">Completed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* STAGE DETAIL — project list */
          <Card>
            <CardHeader className="border-b pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hammer className="h-4 w-4 text-amber-600" />
                  Projects ({filteredRows.length})
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="Search by project, client, location…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 w-72 text-sm"
                    data-testid="pc-search"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredRows.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No projects match.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pc-rows-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Client</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Location</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Completed</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredRows.map(row => {
                        const sb = STATUS_BADGE[row.status] || STATUS_BADGE.pending;
                        return (
                          <tr key={row.project_id} className="hover:bg-gray-50" data-testid={`pc-row-${row.project_id}`}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-gray-900">{row.name}</p>
                              <p className="text-[11px] text-gray-400 font-mono">{row.project_code || row.project_id}</p>
                            </td>
                            <td className="px-4 py-2.5 hidden md:table-cell">
                              <p className="text-gray-700">{row.client_name || '-'}</p>
                              {row.client_phone && (
                                <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" />{row.client_phone}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 hidden lg:table-cell">
                              {row.location ? (
                                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row.location}</span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge className={`text-[11px] border ${sb.cls}`}>{sb.label}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-gray-700">{fmtDateTime(row.scheduled_at)}</td>
                            <td className="px-4 py-2.5 text-gray-700 hidden md:table-cell">{fmtDateTime(row.completed_at)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => openSchedule(row)}
                                  data-testid={`pc-schedule-${row.project_id}`}
                                >
                                  <Calendar className="h-3.5 w-3.5 mr-1" /> Schedule
                                </Button>
                                {row.status !== 'completed' ? (
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                    onClick={() => updateStage(row.project_id, row.stage, { status: 'completed' })}
                                    data-testid={`pc-complete-${row.project_id}`}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Completed
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => updateStage(row.project_id, row.stage, { status: 'pending', clear_schedule: false })}
                                    data-testid={`pc-reopen-${row.project_id}`}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog.open} onOpenChange={(o) => !o && !scheduleDialog.submitting && setScheduleDialog({ open: false, project: null, value: '', submitting: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-amber-600" />Schedule</DialogTitle>
            <DialogDescription>
              {scheduleDialog.project?.name} · {data.stages?.find(s => s.key === scheduleDialog.project?.stage)?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Date &amp; Time</label>
              <Input
                type="datetime-local"
                value={scheduleDialog.value}
                onChange={(e) => setScheduleDialog(d => ({ ...d, value: e.target.value }))}
                disabled={scheduleDialog.submitting}
                data-testid="pc-schedule-input"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {scheduleDialog.project?.scheduled_at && (
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={async () => {
                  setScheduleDialog((d) => ({ ...d, submitting: true }));
                  try {
                    await axios.patch(
                      `${API}/cre/pre-construction/${scheduleDialog.project.project_id}/${scheduleDialog.project.stage}`,
                      { clear_schedule: true },
                    );
                    toast.success('Schedule cleared');
                    setScheduleDialog({ open: false, project: null, value: '', submitting: false });
                    fetchData(false);
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Failed to clear');
                    setScheduleDialog((d) => ({ ...d, submitting: false }));
                  }
                }}
                disabled={scheduleDialog.submitting}
                data-testid="pc-schedule-clear"
              >
                Clear
              </Button>
            )}
            <Button variant="outline" onClick={() => setScheduleDialog({ open: false, project: null, value: '', submitting: false })} disabled={scheduleDialog.submitting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={submitSchedule} disabled={scheduleDialog.submitting} data-testid="pc-schedule-save">
              {scheduleDialog.submitting ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Clock className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
