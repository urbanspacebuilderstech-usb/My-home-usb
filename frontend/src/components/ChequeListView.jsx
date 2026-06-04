import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Search, CheckCircle2, Lock, FileText, Loader2, Building2, AlertTriangle, Eye } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_BADGE = {
  issued: { label: 'Issued', cls: 'bg-blue-100 text-blue-700' },
  post_dated: { label: 'Post Dated', cls: 'bg-amber-100 text-amber-700' },
  deposited: { label: 'Deposited', cls: 'bg-indigo-100 text-indigo-700' },
  cleared: { label: 'Cleared', cls: 'bg-emerald-100 text-emerald-700' },
  bounced: { label: 'Bounced', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
};

const fmtMoney = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * Reusable cheque list view.
 * scope: 'cre' | 'project'
 *   - 'cre' uses GET /api/cre/cheques  (incoming-only across projects, or specific project)
 *   - 'project' uses GET /api/projects/{projectId}/cheques (incoming + outgoing for that project)
 * userRole: drives Open button visibility (only super_admin/cre can open)
 * projectId: optional — when present, scopes the list
 */
export default function ChequeListView({ scope = 'cre', projectId = null, userRole = null, onAction = null }) {
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all | open_pending | open_requested | opened | by_project
  const [openDialog, setOpenDialog] = useState({ open: false, cheque: null, remarks: '' });
  const [requestDialog, setRequestDialog] = useState({ open: false, cheque: null, remarks: '' });
  const [submitting, setSubmitting] = useState(false);

  const canOpen = ['super_admin', 'cre'].includes(userRole);
  const canRequestOpen = ['super_admin', 'accountant'].includes(userRole);
  const canBounce = ['super_admin', 'accountant'].includes(userRole);
  const [bounceDialog, setBounceDialog] = useState({ open: false, cheque: null, reason: '', charges: '' });
  const [usageDialog, setUsageDialog] = useState({ open: false, cheque: null, data: null, loading: false });

  const openUsageDialog = async (cheque) => {
    setUsageDialog({ open: true, cheque, data: null, loading: true });
    try {
      const r = await axios.get(`${API}/cheques/${cheque.cheque_id}/usage`);
      setUsageDialog({ open: true, cheque, data: r.data, loading: false });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load cheque details');
      setUsageDialog({ open: false, cheque: null, data: null, loading: false });
    }
  };

  const fetchCheques = async () => {
    try {
      setLoading(true);
      let url;
      if (scope === 'project' && projectId) {
        url = `${API}/projects/${projectId}/cheques`;
      } else if (scope === 'accountant') {
        url = `${API}/accountant/cheques${projectId ? `?project_id=${projectId}` : ''}`;
      } else {
        url = `${API}/cre/cheques${projectId ? `?project_id=${projectId}` : ''}`;
      }
      const res = await axios.get(url);
      setCheques(res.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load cheques');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCheques(); /* eslint-disable-next-line */ }, [scope, projectId]);

  const handleOpen = async () => {
    if (!openDialog.cheque) return;
    try {
      setSubmitting(true);
      await axios.patch(`${API}/cre/cheques/${openDialog.cheque.cheque_id}/open`, {
        remarks: openDialog.remarks || null,
      });
      toast.success('Cheque opened. Accountant can now deposit/clear it.');
      setOpenDialog({ open: false, cheque: null, remarks: '' });
      fetchCheques();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to open cheque');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestOpen = async () => {
    if (!requestDialog.cheque) return;
    try {
      setSubmitting(true);
      await axios.patch(`${API}/accountant/cheques/${requestDialog.cheque.cheque_id}/request-open`, {
        remarks: requestDialog.remarks || null,
      });
      toast.success('Open request sent to CRE');
      setRequestDialog({ open: false, cheque: null, remarks: '' });
      fetchCheques();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to send request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBounce = async () => {
    if (!bounceDialog.cheque) return;
    if (!bounceDialog.reason.trim()) { toast.error('Bounce reason is required'); return; }
    try {
      setSubmitting(true);
      const r = await axios.post(`${API}/accountant/cheques/${bounceDialog.cheque.cheque_id}/bounce`, {
        reason: bounceDialog.reason.trim(),
        charges: parseFloat(bounceDialog.charges) || 0,
      });
      const parts = [];
      if (r.data.income_reversed) parts.push('Payment Schedule re-collect row created');
      if (r.data.expense_reversed) parts.push('Material approval re-opened');
      toast.success(`Cheque bounced. ${parts.join(' · ') || 'Status updated'}`);
      setBounceDialog({ open: false, cheque: null, reason: '', charges: '' });
      fetchCheques();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to bounce cheque');
    } finally {
      setSubmitting(false);
    }
  };


  // Filtering
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cheques.filter(c => {
      // Search match
      if (term) {
        const hay = `${c.cheque_number} ${c.bank_name} ${c.party_name} ${c.project_name || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      // Tab filter
      const consumed = !!(c.used_for_expense_id || c.income_id);
      if (activeTab === 'received') return c.cheque_type === 'incoming' && c.status !== 'bounced';
      if (activeTab === 'open_pending') return c.cheque_type === 'incoming' && !c.is_opened && c.status !== 'cancelled' && c.status !== 'bounced';
      if (activeTab === 'open_requested') return c.cheque_type === 'incoming' && !c.is_opened && c.open_requested && c.status !== 'cancelled' && c.status !== 'bounced';
      if (activeTab === 'opened') return c.is_opened && !consumed && c.status !== 'bounced';
      if (activeTab === 'issued') return consumed && c.status !== 'bounced';
      if (activeTab === 'bounced') return c.status === 'bounced';
      if (activeTab === 'incoming') return c.cheque_type === 'incoming';
      if (activeTab === 'outgoing') return c.cheque_type === 'outgoing';
      return true;
    });
  }, [cheques, search, activeTab]);

  // Project-wise grouping (simple: name -> rows)
  const projectGroups = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      const key = c.project_name || 'Unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return Object.entries(map).map(([name, rows]) => ({
      name,
      rows,
      total: rows.reduce((s, r) => s + (r.amount || 0), 0),
      count: rows.length,
    })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const stats = useMemo(() => {
    const incoming = cheques.filter(c => c.cheque_type === 'incoming');
    const outgoing = cheques.filter(c => c.cheque_type === 'outgoing');
    const pending = cheques.filter(c => c.cheque_type === 'incoming' && !c.is_opened && c.status !== 'cancelled');
    const requested = cheques.filter(c => c.cheque_type === 'incoming' && !c.is_opened && c.open_requested && c.status !== 'cancelled');
    const opened = cheques.filter(c => c.is_opened);
    return {
      total: cheques.length,
      total_amount: cheques.reduce((s, c) => s + (c.amount || 0), 0),
      incoming_count: incoming.length,
      incoming_amount: incoming.reduce((s, c) => s + (c.amount || 0), 0),
      outgoing_count: outgoing.length,
      outgoing_amount: outgoing.reduce((s, c) => s + (c.amount || 0), 0),
      pending_open: pending.length,
      pending_amount: pending.reduce((s, c) => s + (c.amount || 0), 0),
      open_requested_count: requested.length,
      open_requested_amount: requested.reduce((s, c) => s + (c.amount || 0), 0),
      opened_count: opened.length,
    };
  }, [cheques]);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading cheques…</div>;
  }

  return (
    <div className="space-y-3" data-testid={`cheque-list-view-${scope}`}>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {scope === 'accountant' ? (
          <>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Incoming</p>
                <p className="text-lg sm:text-xl font-bold text-emerald-700">{stats.incoming_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.incoming_amount)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Outgoing</p>
                <p className="text-lg sm:text-xl font-bold text-orange-700">{stats.outgoing_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.outgoing_amount)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('open_pending')}>
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Awaiting CRE</p>
                <p className="text-lg sm:text-xl font-bold text-amber-700">{stats.pending_open}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.pending_amount)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('open_requested')}>
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Open Requested</p>
                <p className="text-lg sm:text-xl font-bold text-blue-700">{stats.open_requested_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.open_requested_amount)}</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Total Cheques</p>
                <p className="text-lg sm:text-xl font-bold text-blue-700">{stats.total}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.total_amount)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Awaiting CRE Open</p>
                <p className="text-lg sm:text-xl font-bold text-amber-700">{stats.pending_open}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.pending_amount)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('open_requested')}>
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Accountant Requested</p>
                <p className="text-lg sm:text-xl font-bold text-blue-700">{stats.open_requested_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{fmtMoney(stats.open_requested_amount)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">Opened by CRE</p>
                <p className="text-lg sm:text-xl font-bold text-emerald-700">{stats.opened_count}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5 flex-wrap">
              {[
                { k: 'all', label: 'All' },
                { k: 'received', label: 'Received' },
                { k: 'opened', label: 'Opened' },
                { k: 'open_requested', label: 'Awaiting CRE' },
                { k: 'issued', label: 'Issued' },
                { k: 'bounced', label: 'Bounced' },
                ...(scope === 'cre' ? [{ k: 'by_project', label: 'Project Wise' }] : []),
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setActiveTab(t.k)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'} ${t.k === 'bounced' && activeTab !== t.k ? 'text-red-600 hover:text-red-700' : ''}`}
                  data-testid={`cheque-tab-${t.k}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search cheque #, bank, party, project…"
                className="pl-8 h-9 text-xs"
                data-testid="cheque-search-input"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project-wise grouped view */}
      {activeTab === 'by_project' ? (
        <div className="space-y-3">
          {projectGroups.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-gray-400"><Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />No cheques in scope</CardContent></Card>
          ) : projectGroups.map(g => (
            <Card key={g.name}>
              <CardContent className="p-0">
                <div className="bg-violet-50 px-4 py-2 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-violet-600" />
                    <span className="font-semibold text-sm">{g.name}</span>
                    <Badge className="bg-violet-200 text-violet-800 text-[10px]">{g.count} cheques</Badge>
                  </div>
                  <span className="text-sm font-bold text-violet-700">{fmtMoney(g.total)}</span>
                </div>
                <ChequeTable rows={g.rows} canOpen={canOpen} canRequestOpen={canRequestOpen} canBounce={canBounce}
                  onOpenRequest={(c) => setOpenDialog({ open: true, cheque: c, remarks: '' })}
                  onRequestOpen={(c) => setRequestDialog({ open: true, cheque: c, remarks: '' })}
                  onBounce={(c) => setBounceDialog({ open: true, cheque: c, reason: '', charges: '' })}
                  onView={openUsageDialog}
                  onAction={onAction} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No cheques match the current filter</p>
              </div>
            ) : (
              <ChequeTable rows={filtered} canOpen={canOpen} canRequestOpen={canRequestOpen} canBounce={canBounce}
                onOpenRequest={(c) => setOpenDialog({ open: true, cheque: c, remarks: '' })}
                onRequestOpen={(c) => setRequestDialog({ open: true, cheque: c, remarks: '' })}
                onBounce={(c) => setBounceDialog({ open: true, cheque: c, reason: '', charges: '' })}
                onView={openUsageDialog}
                onAction={onAction} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Open Cheque Dialog */}
      <Dialog open={openDialog.open} onOpenChange={(open) => !open && setOpenDialog({ open: false, cheque: null, remarks: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Open Cheque</DialogTitle>
          </DialogHeader>
          {openDialog.cheque && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded-lg p-3">
                <div><span className="text-gray-500">Cheque #</span><p className="font-semibold">{openDialog.cheque.cheque_number}</p></div>
                <div><span className="text-gray-500">Amount</span><p className="font-semibold text-emerald-700">{fmtMoney(openDialog.cheque.amount)}</p></div>
                <div><span className="text-gray-500">Bank</span><p className="font-medium">{openDialog.cheque.bank_name}</p></div>
                <div><span className="text-gray-500">Party</span><p className="font-medium">{openDialog.cheque.party_name}</p></div>
                <div className="col-span-2"><span className="text-gray-500">Project</span><p className="font-medium">{openDialog.cheque.project_name || '-'}</p></div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Remarks (optional)</label>
                <Textarea
                  rows={2}
                  value={openDialog.remarks}
                  onChange={(e) => setOpenDialog({ ...openDialog, remarks: e.target.value })}
                  placeholder="e.g. Verified with client, ready for deposit"
                  data-testid="cheque-open-remarks"
                />
              </div>
              <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                <strong>Note:</strong> Once opened, the Accountant can proceed to deposit/clear this cheque. This action cannot be undone.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog({ open: false, cheque: null, remarks: '' })} disabled={submitting}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpen} disabled={submitting} data-testid="cheque-open-confirm">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Opening…</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Open Cheque</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accountant: Request CRE to Open dialog */}
      <Dialog open={requestDialog.open} onOpenChange={(open) => !open && setRequestDialog({ open: false, cheque: null, remarks: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-blue-600" /> Request CRE to Open Cheque</DialogTitle>
          </DialogHeader>
          {requestDialog.cheque && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded-lg p-3">
                <div><span className="text-gray-500">Cheque #</span><p className="font-semibold">{requestDialog.cheque.cheque_number}</p></div>
                <div><span className="text-gray-500">Amount</span><p className="font-semibold text-emerald-700">{fmtMoney(requestDialog.cheque.amount)}</p></div>
                <div><span className="text-gray-500">Bank</span><p className="font-medium">{requestDialog.cheque.bank_name}</p></div>
                <div><span className="text-gray-500">Party</span><p className="font-medium">{requestDialog.cheque.party_name}</p></div>
                <div className="col-span-2"><span className="text-gray-500">Project</span><p className="font-medium">{requestDialog.cheque.project_name || '-'}</p></div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Note to CRE (optional)</label>
                <Textarea
                  rows={2}
                  value={requestDialog.remarks}
                  onChange={(e) => setRequestDialog({ ...requestDialog, remarks: e.target.value })}
                  placeholder="e.g. Need this opened by EOD for tomorrow's deposit"
                  data-testid="cheque-request-remarks"
                />
              </div>
              <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-800">
                CRE will be notified. Once they open the cheque, you'll be able to deposit/clear it.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialog({ open: false, cheque: null, remarks: '' })} disabled={submitting}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleRequestOpen} disabled={submitting} data-testid="cheque-request-confirm">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…</> : <><Lock className="h-4 w-4 mr-1" /> Send Request</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bounce Cheque dialog (Accountant) — reverses linked income / expense */}
      <Dialog open={bounceDialog.open} onOpenChange={(open) => !open && setBounceDialog({ open: false, cheque: null, reason: '', charges: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Mark Cheque as Bounced
            </DialogTitle>
          </DialogHeader>
          {bounceDialog.cheque && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-red-50 border border-red-200 rounded-lg p-3">
                <div><span className="text-gray-500">Cheque #</span><p className="font-semibold">{bounceDialog.cheque.cheque_number}</p></div>
                <div><span className="text-gray-500">Amount</span><p className="font-semibold text-red-700">{fmtMoney(bounceDialog.cheque.amount)}</p></div>
                <div><span className="text-gray-500">Bank</span><p className="font-medium">{bounceDialog.cheque.bank_name}</p></div>
                <div><span className="text-gray-500">Party</span><p className="font-medium">{bounceDialog.cheque.party_name}</p></div>
                <div className="col-span-2"><span className="text-gray-500">Project</span><p className="font-medium">{bounceDialog.cheque.project_name || '-'}</p></div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Bounce Reason <span className="text-red-500">*</span></label>
                <Textarea
                  rows={2}
                  value={bounceDialog.reason}
                  onChange={(e) => setBounceDialog({ ...bounceDialog, reason: e.target.value })}
                  placeholder="e.g. Insufficient funds / Signature mismatch / Account closed"
                  data-testid="cheque-bounce-reason"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Bounce Charges (optional)</label>
                <Input
                  type="number"
                  min="0"
                  value={bounceDialog.charges}
                  onChange={(e) => setBounceDialog({ ...bounceDialog, charges: e.target.value })}
                  placeholder="e.g. 500"
                  data-testid="cheque-bounce-charges"
                />
              </div>
              <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 leading-relaxed">
                <strong>This action cascades:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>If the cheque cleared an income → that income is reversed, project income drops by {fmtMoney(bounceDialog.cheque.amount)}, and a fresh pending row appears in the CRE Payment Schedule for re-collection.</li>
                  <li>If the cheque paid a vendor → the material/labour expense is reversed and returns to the Accountant Approval queue with a "Cheque Bounced" banner.</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBounceDialog({ open: false, cheque: null, reason: '', charges: '' })} disabled={submitting}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleBounce} disabled={submitting} data-testid="cheque-bounce-confirm">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Bouncing…</> : <><AlertTriangle className="h-4 w-4 mr-1" /> Mark as Bounced</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cheque Usage Detail Dialog — shows everywhere the cheque touched the books */}
      <Dialog open={usageDialog.open} onOpenChange={(o) => !o && setUsageDialog({ open: false, cheque: null, data: null, loading: false })}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Eye className="h-5 w-5" /> Cheque Usage Details
            </DialogTitle>
          </DialogHeader>
          {usageDialog.loading || !usageDialog.data ? (
            <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : (
            <ChequeUsageBody data={usageDialog.data} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsageDialog({ open: false, cheque: null, data: null, loading: false })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChequeTable({ rows, canOpen, canRequestOpen, canBounce, onOpenRequest, onRequestOpen, onBounce, onView, onAction }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Cheque No</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Bank</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Party</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Cheque Date</th>
            <th className="text-center px-3 py-2 font-medium text-gray-500">Status</th>
            <th className="text-center px-3 py-2 font-medium text-gray-500">CRE</th>
            <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const sb = STATUS_BADGE[c.status] || { label: c.status, cls: 'bg-gray-100 text-gray-700' };
            const isLockedIncoming = !c.is_opened && c.cheque_type === 'incoming' && c.status !== 'cancelled';
            const isConsumed = !!(c.used_for_expense_id || c.income_id);
            const isBounceable = canBounce && isConsumed && c.status !== 'bounced' && c.status !== 'cancelled' && c.status !== 'cleared';
            return (
              <tr key={c.cheque_id} className={`border-b hover:bg-gray-50 ${c.status === 'bounced' ? 'bg-red-50/40' : c.open_requested && !c.is_opened ? 'bg-blue-50/30' : ''}`} data-testid={`cheque-row-${c.cheque_id}`}>
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2 font-mono font-semibold">{c.cheque_number}</td>
                <td className="px-3 py-2">{c.bank_name}</td>
                <td className="px-3 py-2">{c.party_name}</td>
                <td className="px-3 py-2 text-violet-700">{c.project_name || '-'}</td>
                <td className="px-3 py-2">
                  <Badge className={c.cheque_type === 'incoming' ? 'bg-emerald-100 text-emerald-700 text-[10px]' : 'bg-orange-100 text-orange-700 text-[10px]'}>
                    {c.cheque_type === 'incoming' ? 'Incoming' : 'Outgoing'}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-semibold">{fmtMoney(c.amount)}</td>
                <td className="px-3 py-2 text-gray-600">{fmtDate(c.cheque_date)}</td>
                <td className="px-3 py-2 text-center">
                  <Badge className={`${sb.cls} text-[10px]`}>{sb.label}</Badge>
                  {c.status === 'bounced' && c.bounce_reason && (
                    <p className="text-[9px] text-red-600 italic mt-0.5 max-w-[140px] truncate" title={c.bounce_reason}>{c.bounce_reason}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {c.is_opened ? (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1" title={c.opened_by_name ? `Opened by ${c.opened_by_name}` : ''}>
                      <CheckCircle2 className="h-3 w-3" /> Opened
                    </Badge>
                  ) : c.cheque_type === 'outgoing' ? (
                    <span className="text-[10px] text-gray-300">—</span>
                  ) : c.open_requested ? (
                    <Badge className="bg-blue-100 text-blue-700 text-[10px] gap-1" title={c.open_requested_by_name ? `Requested by ${c.open_requested_by_name}` : ''}>
                      <Loader2 className="h-3 w-3" /> Open Requested
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1" title="Awaiting open request from Accountant">
                      <Lock className="h-3 w-3" /> Locked
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {/* CRE: shows Open button on locked incoming */}
                    {isLockedIncoming && canOpen ? (
                      <Button
                        size="sm"
                        className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => onOpenRequest(c)}
                        data-testid={`cheque-open-btn-${c.cheque_id}`}
                      >
                        Open
                      </Button>
                    ) : isLockedIncoming && canRequestOpen && !c.open_requested ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => onRequestOpen(c)}
                        data-testid={`cheque-request-btn-${c.cheque_id}`}
                      >
                        Request Open
                      </Button>
                    ) : isLockedIncoming && c.open_requested ? (
                      <span className="text-[10px] text-blue-600 italic">Sent to CRE</span>
                    ) : c.is_opened && !isConsumed ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-gray-700 hover:bg-gray-100"
                        onClick={() => onAction && onAction('update_status', c)}
                        title="Update status"
                        data-testid={`cheque-update-btn-${c.cheque_id}`}
                      >
                        {onAction ? 'Update' : (c.opened_by_name ? `by ${c.opened_by_name.split(' ')[0]}` : '✓')}
                      </Button>
                    ) : null}
                    {/* Bounce button for any consumed (Issued) cheque */}
                    {isBounceable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => onBounce && onBounce(c)}
                        data-testid={`cheque-bounce-btn-${c.cheque_id}`}
                      >
                        Bounce
                      </Button>
                    )}
                    {/* View button — always available for non-locked cheques (incomes may exist even without used_for_expense_id) */}
                    {onView && c.is_opened && c.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-50"
                        title="View cheque details"
                        onClick={() => onView(c)}
                        data-testid={`cheque-view-btn-${c.cheque_id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!isLockedIncoming && !c.is_opened && !isBounceable && c.status !== 'bounced' && (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function ChequeUsageBody({ data }) {
  const c = data.cheque || {};
  const incomes = data.incomes || [];
  const stages = data.stages_settled || [];
  const exp = data.expense;
  const summary = data.summary || {};
  const [tab, setTab] = useState('income');

  const hasIncome = incomes.length > 0;
  const hasUsed = !!exp || stages.length > 0;
  const hasBounce = c.status === 'bounced';

  // Auto-pick a default tab when popup opens (income > used > bounce)
  useEffect(() => {
    if (hasIncome) setTab('income');
    else if (hasUsed) setTab('used');
    else if (hasBounce) setTab('bounce');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Cheque master card (always visible) */}
      <Card className={`border-2 ${c.status === 'bounced' ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-blue-700 uppercase">Cheque Details</p>
            <Badge className={c.status === 'bounced' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}>
              {c.status === 'bounced' ? 'Bounced' : (c.status || '').replace('_', ' ')}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className="text-gray-500 text-[10px]">Cheque #</span><p className="font-mono font-bold">{c.cheque_number}</p></div>
            <div><span className="text-gray-500 text-[10px]">Bank</span><p className="font-medium">{c.bank_name || '—'}</p></div>
            <div><span className="text-gray-500 text-[10px]">Party</span><p className="font-medium">{c.party_name || '—'}</p></div>
            <div><span className="text-gray-500 text-[10px]">Amount</span><p className="font-bold text-blue-700">{fmtMoney(c.amount)}</p></div>
            <div><span className="text-gray-500 text-[10px]">Project</span><p className="font-medium text-violet-700">{c.project_name || '—'}</p></div>
            <div><span className="text-gray-500 text-[10px]">Cheque Date</span><p className="font-medium">{fmtDate(c.cheque_date)}</p></div>
            <div><span className="text-gray-500 text-[10px]">Opened By</span><p className="font-medium">{c.opened_by_name || '—'}</p></div>
            <div><span className="text-gray-500 text-[10px]">Used At</span><p className="font-medium">{fmtDate(c.used_at)}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Sub-tabs */}
      <div className="flex bg-gray-100 rounded-lg p-0.5">
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'income' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
          onClick={() => setTab('income')}
          data-testid="usage-tab-income"
        >
          Income Details <Badge className={`${tab === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'} text-[9px]`}>{incomes.length}</Badge>
        </button>
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'used' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500'}`}
          onClick={() => setTab('used')}
          data-testid="usage-tab-used"
        >
          Used Details <Badge className={`${tab === 'used' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'} text-[9px]`}>{exp ? 1 : 0}</Badge>
        </button>
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'bounce' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500'}`}
          onClick={() => setTab('bounce')}
          data-testid="usage-tab-bounce"
        >
          Bounce Details <Badge className={`${tab === 'bounce' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'} text-[9px]`}>{hasBounce ? '1' : '0'}</Badge>
        </button>
      </div>

      {/* TAB: Income Details */}
      {tab === 'income' && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-emerald-700 uppercase">Income Collected · {summary.total_incomes || 0}</p>
              <span className="text-xs text-gray-500">Total: <span className="font-bold text-emerald-700">{fmtMoney(summary.total_income_amount)}</span></span>
            </div>
            {incomes.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">
                <FileText className="h-6 w-6 mx-auto mb-1 opacity-40" />
                No income rows linked to this cheque yet. The cheque must first be used to collect an advance, payment stage, or additional cost.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr className="border-b text-gray-500">
                      <th className="text-left px-2 py-1.5 font-semibold">Project</th>
                      <th className="text-left px-2 py-1.5 font-semibold">Stage / Category</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Amount</th>
                      <th className="text-left px-2 py-1.5 font-semibold">Collected At</th>
                      <th className="text-left px-2 py-1.5 font-semibold">Collected By</th>
                      <th className="text-center px-2 py-1.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomes.map(inc => (
                      <tr key={inc.income_id} className={`border-b ${inc.status === 'cheque_bounced' ? 'bg-red-50/40' : ''}`}>
                        <td className="px-2 py-1.5 text-violet-700">{inc.project_name || '—'}</td>
                        <td className="px-2 py-1.5">
                          {inc.stage_name || inc.category || '—'}
                          {inc.stage_id && <span className="text-[9px] text-gray-400 ml-1">·stage</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmtMoney(inc.amount)}</td>
                        <td className="px-2 py-1.5">{fmtDate(inc.payment_date)}</td>
                        <td className="px-2 py-1.5">{inc.collected_by_name || '—'}</td>
                        <td className="px-2 py-1.5 text-center">
                          {inc.status === 'cheque_bounced' ? (
                            <Badge className="bg-red-100 text-red-700 text-[9px]">Bounced</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">{(inc.status || '').replace('_', ' ') || 'collected'}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {stages.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs font-semibold text-violet-700 uppercase mb-2">Payment Stages Affected · {stages.length}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr className="border-b text-gray-500">
                        <th className="text-left px-2 py-1.5">Project</th>
                        <th className="text-left px-2 py-1.5">Stage</th>
                        <th className="text-right px-2 py-1.5">Stage Amt</th>
                        <th className="text-right px-2 py-1.5">Collected</th>
                        <th className="text-left px-2 py-1.5">Date</th>
                        <th className="text-center px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map(s => (
                        <tr key={s.stage_id} className={`border-b ${s.cheque_bounced ? 'bg-red-50/40' : ''}`}>
                          <td className="px-2 py-1.5 text-violet-700">{s.project_name || '—'}</td>
                          <td className="px-2 py-1.5">{s.stage_name || s.stage_label || '—'}</td>
                          <td className="px-2 py-1.5 text-right">{fmtMoney(s.amount)}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmtMoney(s.collected_amount)}</td>
                          <td className="px-2 py-1.5">{fmtDate(s.collected_at)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {s.cheque_bounced ? <Badge className="bg-red-100 text-red-700 text-[9px]">Bounced</Badge> : <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">{(s.status || '').replace('_', ' ')}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB: Used Details (cheque endorsed to a vendor) */}
      {tab === 'used' && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-orange-700 uppercase mb-2">Used For (Endorsed to Vendor)</p>
            {!exp ? (
              <div className="py-6 text-center text-xs text-gray-400">
                <FileText className="h-6 w-6 mx-auto mb-1 opacity-40" />
                This cheque has not been used to pay any vendor expense yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-gray-500 text-[10px]">Vendor</span><p className="font-medium">{exp.vendor_name || '—'}</p></div>
                <div><span className="text-gray-500 text-[10px]">Project</span><p className="font-medium text-violet-700">{exp.project_name || '—'}</p></div>
                <div className="col-span-2"><span className="text-gray-500 text-[10px]">Description</span><p className="font-medium">{exp.description || '—'}</p></div>
                <div><span className="text-gray-500 text-[10px]">Amount</span><p className="font-bold text-orange-700">{fmtMoney(exp.amount)}</p></div>
                <div><span className="text-gray-500 text-[10px]">Paid At</span><p className="font-medium">{fmtDate(exp.paid_at)}</p></div>
                <div><span className="text-gray-500 text-[10px]">Type</span><p className="capitalize">{exp.request_type || '—'}</p></div>
                <div><span className="text-gray-500 text-[10px]">Status</span><p className="capitalize">{(exp.status || '').replace('_', ' ')}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB: Bounce Details */}
      {tab === 'bounce' && (
        <Card className={hasBounce ? 'border-red-300 bg-red-50' : ''}>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-red-700 uppercase mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Bounce Details
            </p>
            {!hasBounce ? (
              <div className="py-6 text-center text-xs text-gray-400">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-emerald-400" />
                This cheque has not been bounced.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2"><span className="text-gray-500 text-[10px]">Reason</span><p className="font-medium text-red-700">{c.bounce_reason || '—'}</p></div>
                <div><span className="text-gray-500 text-[10px]">Bounced By</span><p className="font-medium">{c.bounced_by_name || '—'}</p></div>
                <div><span className="text-gray-500 text-[10px]">Bounced At</span><p className="font-medium">{fmtDate(c.bounced_at)}</p></div>
                <div><span className="text-gray-500 text-[10px]">Charges</span><p className="font-bold text-red-700">{fmtMoney(c.bounce_charges || 0)}</p></div>
                <div><span className="text-gray-500 text-[10px]">Cheque Amount</span><p className="font-bold text-red-700">{fmtMoney(c.amount)}</p></div>
                {(incomes.length > 0 || stages.length > 0) && (
                  <div className="col-span-2 mt-2 pt-2 border-t border-red-200 text-[11px] text-red-700">
                    <span className="font-semibold">Cascade reversal:</span> {incomes.length} income row(s) + {stages.length} payment stage(s) reverted to pending.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
