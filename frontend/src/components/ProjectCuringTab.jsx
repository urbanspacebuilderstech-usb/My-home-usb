import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Video, History as HistoryIcon, MessageCircle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Self-contained Curing Video tab — opens recording dialog + shows project-scoped history.
export default function ProjectCuringTab({ projectId, projectName, user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/site-engineer/curing-video/history?project_id=${projectId}`);
      setHistory(res.data || []);
    } catch { setHistory([]); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/site-engineer/curing-video`, {
        project_id: projectId,
        curing_done: done,
      });
      const record = res.data;
      toast.success('Curing video record saved');
      // Auto-open WhatsApp when curing marked done.
      if (done && record?.client_phone) {
        const msg = encodeURIComponent(`Curing video done for project: ${record.project_name} on ${new Date().toLocaleDateString('en-IN')}. - ${user?.name || 'Site Engineer'}`);
        const phone = String(record.client_phone).replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
        await axios.patch(`${API}/site-engineer/curing-video/${record.record_id}/whatsapp-sent`).catch(() => {});
      }
      setDialogOpen(false);
      setDone(false);
      fetchHistory();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally { setSubmitting(false); }
  };

  const sendWhatsApp = async (record) => {
    if (!record.client_phone) { toast.error('No client phone on record'); return; }
    const msg = encodeURIComponent(`Curing video done for project: ${record.project_name} on ${new Date(record.date_time).toLocaleDateString('en-IN')}. - ${user?.name || 'Site Engineer'}`);
    const phone = String(record.client_phone).replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    await axios.patch(`${API}/site-engineer/curing-video/${record.record_id}/whatsapp-sent`).catch(() => {});
    fetchHistory();
  };

  return (
    <div data-testid="project-curing-tab">
      <Card>
        <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-purple-700">
              <Video className="h-5 w-5" /> Curing Video Log
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">{projectName} · daily curing video records sent to client.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={fetchHistory} data-testid="curing-refresh">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
            <Button size="sm" className="h-8 gap-1 bg-green-600 hover:bg-green-700" onClick={() => setDialogOpen(true)} data-testid="curing-record-btn">
              <Video className="h-3 w-3" /> Record Curing
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          {loading ? (
            <p className="text-center text-xs text-gray-400 py-6 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-8">No curing records yet — tap <strong>Record Curing</strong> to start.</p>
          ) : (
            <div className="space-y-2" data-testid="curing-history-list">
              {history.map(r => (
                <div key={r.record_id} className="flex items-center justify-between border rounded-md p-2.5 bg-purple-50/30 border-purple-200" data-testid={`curing-row-${r.record_id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${r.curing_done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {r.curing_done ? 'Done' : 'In progress'}
                      </Badge>
                      {r.whatsapp_sent && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">WhatsApp sent</Badge>}
                      <span className="text-[11px] text-gray-500"><HistoryIcon className="inline h-3 w-3 mr-1" />{new Date(r.date_time).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                    </div>
                    {r.recorded_by_name && <p className="text-[11px] text-gray-500 mt-0.5">Recorded by {r.recorded_by_name}</p>}
                  </div>
                  {r.curing_done && r.client_phone && !r.whatsapp_sent && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 border-green-300 text-green-700 hover:bg-green-50 text-[11px]" onClick={() => sendWhatsApp(r)} data-testid={`curing-wa-${r.record_id}`}>
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="curing-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700"><Video className="h-5 w-5" /> Record Curing Video</DialogTitle>
            <DialogDescription className="text-xs">{projectName}. Tick if curing is fully done — we'll auto-open WhatsApp to notify the client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-md border hover:border-purple-400 hover:bg-purple-50/50 transition-colors">
              <Checkbox checked={done} onCheckedChange={setDone} data-testid="curing-done-checkbox" />
              <div>
                <p className="text-sm font-medium">Curing fully done</p>
                <p className="text-[11px] text-gray-500">Will trigger a WhatsApp message to the client.</p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={submit} disabled={submitting} data-testid="curing-submit">
              {submitting ? 'Saving…' : 'Save Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
