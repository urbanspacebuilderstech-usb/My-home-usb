import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Search, CheckCircle2, Lock, FileText, Loader2, Building2, AlertTriangle, Eye, Trash2, XCircle } from 'lucide-react';

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
  const canDelete = ['super_admin', 'accountant'].includes(userRole);
  const [bounceDialog, setBounceDialog] = useState({ open: false, cheque: null, reason: '', charges: '' });
  const [usageDialog, setUsageDialog] = useState({ open: false, cheque: null, data: null, loading: false });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, cheque: null, password: '' });

  const handleDelete = async () => {
    if (!deleteDialog.cheque) return;
    if (!deleteDialog.password) { toast.error('Password required'); return; }
    try {
      setSubmitting(true);
      await axios.delete(`${API}/accountant/cheques/${deleteDialog.cheque.cheque_id}`, {
        data: { password: deleteDialog.password },
      });
      toast.success(`Cheque ${deleteDialog.cheque.cheque_number} deleted`);
      setDeleteDialog({ open: false, cheque: null, password: '' });
      fetchCheques();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to delete cheque');
    } finally {
      setSubmitting(false);
    }
  };

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
      // Tab filter — strict per-tab semantics.
      // NOTE: `income_id` is set at cheque creation (back-link to the advance/
      // collection that produced the cheque) so it's NOT a reliable signal of
      // "issued to a vendor". The only true signal of an out-going Issued cheque
      // is `used_for_expense_id` (cheque endorsed to pay a vendor bill).
      // For incoming cheque lifecycle we use the open / open_requested flags.
      const isVendorIssued = !!c.used_for_expense_id;
      const isIncoming = c.cheque_type === 'incoming';
      const isAlive = c.status !== 'cancelled' && c.status !== 'bounced';
      if (activeTab === 'received')
        return isIncoming && isAlive && !c.is_opened && !c.open_requested;
      if (activeTab === 'open_pending')
        return isIncoming && isAlive && !c.is_opened && !c.open_requested;
      if (activeTab === 'open_requested' || activeTab === 'awaiting_cre')
        return isIncoming && isAlive && !c.is_opened && !!c.open_requested;
      if (activeTab === 'opened')
        return isIncoming && isAlive && c.is_opened && !isVendorIssued;
      if (activeTab === 'issued')
        return isVendorIssued && c.status !== 'bounced';
      if (activeTab === 'bounced')
        return c.status === 'bounced';
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
    // Strict per-tab classifications (must mirror the tab filter logic below)
    const isAlive = (c) => c.status !== 'cancelled' && c.status !== 'bounced';
    const isIncoming = (c) => c.cheque_type === 'incoming';
    const receivedRows  = cheques.filter(c => isIncoming(c) && isAlive(c) && !c.is_opened && !c.open_requested);
    const awaitingRows  = cheques.filter(c => isIncoming(c) && isAlive(c) && !c.is_opened && !!c.open_requested);
    const openedRows    = cheques.filter(c => isIncoming(c) && isAlive(c) && c.is_opened && !c.used_for_expense_id);
    const issuedRows    = cheques.filter(c => !!c.used_for_expense_id && c.status !== 'bounced');
    const bouncedRows   = cheques.filter(c => c.status === 'bounced');
    const sumAmt = (arr) => arr.reduce((s, c) => s + (c.amount || 0), 0);
    return {
      total: cheques.length,
      total_amount: sumAmt(cheques),
      incoming_count: incoming.length,
      incoming_amount: sumAmt(incoming),
      outgoing_count: outgoing.length,
      outgoing_amount: sumAmt(outgoing),
      pending_open: receivedRows.length,
      pending_amount: sumAmt(receivedRows),
      open_requested_count: awaitingRows.length,
      open_requested_amount: sumAmt(awaitingRows),
      opened_count: openedRows.length,
      opened_amount: sumAmt(openedRows),
      issued_count: issuedRows.length,
      issued_amount: sumAmt(issuedRows),
      bounced_count: bouncedRows.length,
      bounced_amount: sumAmt(bouncedRows),
    };
  }, [cheques]);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-gray-400 gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading cheques…</div>;
  }

  return (
    <div className="space-y-3" data-testid={`cheque-list-view-${scope}`}>
      {/* Lifecycle Summary — visible on every tab; click switches tab; current tab is highlighted */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <SummaryCard color="amber"   label="Received"     amount={stats.pending_amount}         count={stats.pending_open}         onClick={() => setActiveTab('received')}       isActive={activeTab === 'received'}       testId="summary-received" />
        <SummaryCard color="blue"    label="Awaiting CRE" amount={stats.open_requested_amount}  count={stats.open_requested_count} onClick={() => setActiveTab('open_requested')} isActive={activeTab === 'open_requested'} testId="summary-awaiting" />
        <SummaryCard color="emerald" label="Opened"       amount={stats.opened_amount}          count={stats.opened_count}         onClick={() => setActiveTab('opened')}         isActive={activeTab === 'opened'}         testId="summary-opened" />
        <SummaryCard color="orange"  label="Issued"       amount={stats.issued_amount}          count={stats.issued_count}         onClick={() => setActiveTab('issued')}         isActive={activeTab === 'issued'}         testId="summary-issued" />
        <SummaryCard color="red"     label="Bounced"      amount={stats.bounced_amount}         count={stats.bounced_count}        onClick={() => setActiveTab('bounced')}        isActive={activeTab === 'bounced'}        testId="summary-bounced" />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5 flex-wrap">
              {[
                { k: 'all',            label: 'All',          count: stats.total,                badgeColor: 'bg-gray-700 text-white' },
                { k: 'received',       label: 'Received',     count: stats.pending_open,         badgeColor: 'bg-amber-500 text-white' },
                { k: 'opened',         label: 'Opened',       count: stats.opened_count,         badgeColor: 'bg-emerald-500 text-white' },
                { k: 'open_requested', label: 'Awaiting CRE', count: stats.open_requested_count, badgeColor: 'bg-blue-500 text-white' },
                { k: 'issued',         label: 'Issued',       count: stats.issued_count,         badgeColor: 'bg-orange-500 text-white' },
                { k: 'bounced',        label: 'Bounced',      count: stats.bounced_count,        badgeColor: 'bg-red-500 text-white' },
                ...(scope === 'cre' ? [{ k: 'by_project', label: 'Project Wise', count: null }] : []),
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setActiveTab(t.k)}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${activeTab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'} ${t.k === 'bounced' && activeTab !== t.k ? 'text-red-600 hover:text-red-700' : ''}`}
                  data-testid={`cheque-tab-${t.k}`}
                >
                  {t.label}
                  {t.count !== null && t.count !== undefined && (
                    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[9px] font-bold rounded-full px-1 ${t.count > 0 ? t.badgeColor : 'bg-gray-300 text-gray-600'}`}>
                      {t.count}
                    </span>
                  )}
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
                <ChequeTable rows={g.rows} canOpen={canOpen} canRequestOpen={canRequestOpen} canBounce={canBounce} canDelete={canDelete} activeTab={activeTab}
                  onOpenRequest={(c) => setOpenDialog({ open: true, cheque: c, remarks: '' })}
                  onRequestOpen={(c) => setRequestDialog({ open: true, cheque: c, remarks: '' })}
                  onBounce={(c) => setBounceDialog({ open: true, cheque: c, reason: '', charges: '' })}
                  onView={openUsageDialog}
                  onDelete={(c) => setDeleteDialog({ open: true, cheque: c, password: '' })}
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
              <ChequeTable rows={filtered} canOpen={canOpen} canRequestOpen={canRequestOpen} canBounce={canBounce} canDelete={canDelete} activeTab={activeTab}
                onOpenRequest={(c) => setOpenDialog({ open: true, cheque: c, remarks: '' })}
                onRequestOpen={(c) => setRequestDialog({ open: true, cheque: c, remarks: '' })}
                onBounce={(c) => setBounceDialog({ open: true, cheque: c, reason: '', charges: '' })}
                onView={openUsageDialog}
                onDelete={(c) => setDeleteDialog({ open: true, cheque: c, password: '' })}
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

      {/* Delete Cheque dialog — orphan-only, password-confirmed */}
      <Dialog open={deleteDialog.open} onOpenChange={(o) => !o && setDeleteDialog({ open: false, cheque: null, password: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Delete Cheque
            </DialogTitle>
          </DialogHeader>
          {deleteDialog.cheque && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-red-50 border border-red-200 rounded-lg p-3">
                <div><span className="text-gray-500">Cheque #</span><p className="font-semibold">{deleteDialog.cheque.cheque_number}</p></div>
                <div><span className="text-gray-500">Amount</span><p className="font-semibold text-red-700">{fmtMoney(deleteDialog.cheque.amount)}</p></div>
                <div><span className="text-gray-500">Bank</span><p className="font-medium">{deleteDialog.cheque.bank_name || '—'}</p></div>
                <div><span className="text-gray-500">Party</span><p className="font-medium">{deleteDialog.cheque.party_name || '—'}</p></div>
              </div>
              <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 leading-relaxed">
                Only <strong>orphan cheques</strong> can be deleted — cheques that reference incomes/expenses that no longer exist. If this cheque is linked to a real collection or payment, you must <strong>Bounce</strong> it instead. Deletion is a <strong>soft delete</strong> (hidden from lists, kept for audit).
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Confirm with your password <span className="text-red-500">*</span></label>
                <Input
                  type="password"
                  value={deleteDialog.password}
                  onChange={(e) => setDeleteDialog({ ...deleteDialog, password: e.target.value })}
                  placeholder="Your login password"
                  autoFocus
                  data-testid="cheque-delete-password"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, cheque: null, password: '' })} disabled={submitting}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={submitting || !deleteDialog.password} data-testid="cheque-delete-confirm">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4 mr-1" /> Delete Cheque</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChequeTable({ rows, canOpen, canRequestOpen, canBounce, canDelete, onOpenRequest, onRequestOpen, onBounce, onView, onDelete, onAction, activeTab }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Collected Date</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Cheque No</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Bank</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Party</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Cheque Date</th>
            <th className="text-center px-3 py-2 font-medium text-gray-500">Status</th>
            <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const isLockedIncoming = !c.is_opened && c.cheque_type === 'incoming' && c.status !== 'cancelled';
            const isConsumed = !!c.used_for_expense_id;  // true vendor-issued check (income_id is set at creation)
            // Bounce button is restricted to the explicit "Issued" tab only —
            // hidden from All, Received, Opened, Awaiting CRE, Bounced and the
            // project-wise grouping. Bounce-eligibility (consumed + not bounced
            // /cancelled/cleared) still applies.
            const isBounceable = canBounce
              && activeTab === 'issued'
              && isConsumed
              && c.status !== 'bounced'
              && c.status !== 'cancelled'
              && c.status !== 'cleared';
            return (
              <tr key={c.cheque_id} className={`border-b hover:bg-gray-50 ${c.status === 'bounced' ? 'bg-red-50/40' : c.open_requested && !c.is_opened ? 'bg-blue-50/30' : ''}`} data-testid={`cheque-row-${c.cheque_id}`}>
                <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{fmtDate(c.received_at || c.created_at)}</td>
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
                  {c.status === 'bounced' ? (
                    <>
                      <Badge className="bg-red-100 text-red-700 text-[10px] gap-1">
                        <XCircle className="h-3 w-3" /> Bounced
                      </Badge>
                      {c.bounce_reason && (
                        <p className="text-[9px] text-red-600 italic mt-0.5 max-w-[140px] truncate mx-auto" title={c.bounce_reason}>{c.bounce_reason}</p>
                      )}
                    </>
                  ) : c.is_opened ? (
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
                    ) : c.is_opened && c.opened_by_name ? (
                      <span className="text-[10px] text-emerald-600">by {c.opened_by_name.split(' ')[0]}</span>
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
                    {/* Delete (orphan only) */}
                    {canDelete && c.status !== 'deleted' && onDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                        title="Delete cheque (orphan only)"
                        onClick={() => onDelete(c)}
                        data-testid={`cheque-delete-btn-${c.cheque_id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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


function SummaryCard({ color = 'blue', label, amount, count, onClick, isActive, testId }) {
  const palette = {
    amber:   { border: 'border-l-amber-500',   amountClr: 'text-amber-700',   pillBg: 'bg-amber-100',   pillTxt: 'text-amber-700',   ringClr: 'ring-amber-400'   },
    blue:    { border: 'border-l-blue-500',    amountClr: 'text-blue-700',    pillBg: 'bg-blue-100',    pillTxt: 'text-blue-700',    ringClr: 'ring-blue-400'    },
    emerald: { border: 'border-l-emerald-500', amountClr: 'text-emerald-700', pillBg: 'bg-emerald-100', pillTxt: 'text-emerald-700', ringClr: 'ring-emerald-400' },
    orange:  { border: 'border-l-orange-500',  amountClr: 'text-orange-700',  pillBg: 'bg-orange-100',  pillTxt: 'text-orange-700',  ringClr: 'ring-orange-400'  },
    red:     { border: 'border-l-red-500',     amountClr: 'text-red-700',     pillBg: 'bg-red-100',     pillTxt: 'text-red-700',     ringClr: 'ring-red-400'     },
  };
  const p = palette[color] || palette.blue;
  return (
    <Card
      className={`border-l-4 ${p.border} cursor-pointer transition-all ${isActive ? `ring-2 ${p.ringClr} shadow-md` : 'hover:shadow-md'}`}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          <span className={`${p.pillBg} ${p.pillTxt} text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center`}>
            {count || 0}
          </span>
        </div>
        <p className={`${p.amountClr} text-xl sm:text-2xl font-bold leading-tight`}>{fmtMoney(amount)}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{count === 1 ? '1 cheque' : `${count || 0} cheques`}</p>
      </CardContent>
    </Card>
  );
}

function IncomeRow({ inc }) {
  const isBounced = inc.status === 'cheque_bounced';
  const role = (inc.collected_by_role || '').replace(/_/g, ' ');
  const designation = inc.collected_by_designation;
  const byBlock = (
    <span className="text-[11px]">
      {inc.collected_by_name || '—'}
      {(designation || role) && (
        <span className="text-gray-500 ml-1">· <span className="capitalize">{designation || role}</span></span>
      )}
    </span>
  );
  // Header badge per kind
  let kindBadge = null;
  let leftLabel = '';
  if (inc.kind === 'stage') {
    kindBadge = <Badge className="bg-violet-100 text-violet-700 text-[10px]">Stage</Badge>;
    leftLabel = `${inc.stage_name || 'Stage'}${inc.stage_month ? ` · ${inc.stage_month}` : ''}`;
  } else if (inc.kind === 'advance') {
    kindBadge = <Badge className="bg-blue-100 text-blue-700 text-[10px]">Advance</Badge>;
    leftLabel = inc.description || inc.category || 'Advance collected';
  } else {
    kindBadge = <Badge className="bg-gray-200 text-gray-700 text-[10px]">Manual</Badge>;
    leftLabel = inc.description || inc.category || 'Manual entry';
  }
  return (
    <div className={`border rounded-md p-2.5 flex items-center justify-between gap-3 ${isBounced ? 'bg-red-50/40 border-red-200' : 'bg-white'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {kindBadge}
          <span className="font-medium text-xs">{leftLabel}</span>
          {isBounced && <Badge className="bg-red-100 text-red-700 text-[9px]">Bounced</Badge>}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          <span className="text-violet-700">{inc.project_name || '—'}</span>
          <span className="mx-1.5">·</span>
          Collected: <span className="text-gray-700">{fmtDate(inc.payment_date)}</span>
          <span className="mx-1.5">·</span>
          By {byBlock}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-emerald-700">{fmtMoney(inc.amount)}</p>
        {inc.payment_reference && <p className="text-[10px] text-gray-400 font-mono">{inc.payment_reference}</p>}
      </div>
    </div>
  );
}

function ChequeUsageBody({ data }) {
  const c = data.cheque || {};
  const incomes = data.incomes || [];
  const stages = data.stages_settled || [];
  const exp = data.expense;
  const summary = data.summary || {};
  const candidates = data.candidate_incomes || [];
  const diag = data.diagnostics || {};
  const hasOrphan = !!(diag.orphan_income_id || diag.orphan_project_id || diag.orphan_used_for_expense_id);
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
            <div><span className="text-gray-500 text-[10px]">Recorded By</span><p className="font-medium">{c.creator_name || c.recorded_by_name || '—'}</p></div>
            <div><span className="text-gray-500 text-[10px]">Created At</span><p className="font-medium">{fmtDate(c.created_at)}</p></div>
            <div><span className="text-gray-500 text-[10px]">Cheque Type</span><p className="font-medium capitalize">{c.cheque_type || '—'}</p></div>
            <div><span className="text-gray-500 text-[10px]">Source</span><p className="font-medium text-[10px]">{c.income_id ? `Income #${c.income_id.slice(0, 10)}` : (c.used_for_expense_id ? 'Vendor pay' : 'Manual / standalone')}</p></div>
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
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <p className="text-sm font-semibold text-emerald-700">Income Collected · {summary.total_incomes || 0}</p>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase">Total Cheque · Linked Income</p>
                <p className="text-sm font-bold">
                  <span className="text-blue-700">{fmtMoney(c.amount)}</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <span className="text-emerald-700">{fmtMoney(summary.total_income_amount)}</span>
                </p>
              </div>
            </div>
            {incomes.length === 0 ? (
              <div className="space-y-3">
                <div className="py-4 text-center text-xs text-gray-400">
                  <FileText className="h-6 w-6 mx-auto mb-1 opacity-40" />
                  No income rows are <strong>linked</strong> to this cheque.
                </div>
                {hasOrphan && (
                  <div className="border border-rose-200 bg-rose-50 rounded-md p-2.5 text-[11px] text-rose-700">
                    <p className="font-semibold mb-1">⚠ Orphaned references detected on this cheque</p>
                    {diag.orphan_income_id && (
                      <p>• <span className="font-mono">income_id = {diag.orphan_income_id}</span> — points to a record that no longer exists. The original income was likely deleted, rolled back, or never finalised.</p>
                    )}
                    {diag.orphan_project_id && (
                      <p>• <span className="font-mono">project_id = {diag.orphan_project_id}</span> — the project this cheque was associated with no longer exists.</p>
                    )}
                    {diag.orphan_used_for_expense_id && (
                      <p>• <span className="font-mono">used_for_expense_id = {diag.orphan_used_for_expense_id}</span> — the vendor expense this cheque was endorsed to no longer exists.</p>
                    )}
                    <p className="mt-1.5 italic">This cheque is effectively orphaned — re-record the collection/payment to restore a valid link, or mark the cheque as cancelled.</p>
                  </div>
                )}
                {candidates.length > 0 ? (
                  <div className="border border-amber-200 bg-amber-50 rounded-md p-2">
                    <p className="text-[11px] font-semibold text-amber-700 mb-1.5">⚠ Possible matches (same amount + party — not officially linked)</p>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="text-left px-2 py-1">Project</th>
                          <th className="text-left px-2 py-1">Category</th>
                          <th className="text-right px-2 py-1">Amount</th>
                          <th className="text-left px-2 py-1">Ref / Mode</th>
                          <th className="text-left px-2 py-1">Date</th>
                          <th className="text-left px-2 py-1">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map(cd => (
                          <tr key={cd.income_id} className="border-b">
                            <td className="px-2 py-1 text-violet-700">{cd.project_name || '—'}</td>
                            <td className="px-2 py-1 capitalize">{cd.category || cd.description || '—'}</td>
                            <td className="px-2 py-1 text-right font-bold">{fmtMoney(cd.amount)}</td>
                            <td className="px-2 py-1">{cd.payment_mode || '—'}{cd.payment_reference ? ` · ${cd.payment_reference}` : ''}</td>
                            <td className="px-2 py-1">{fmtDate(cd.payment_date)}</td>
                            <td className="px-2 py-1">{cd.collected_by_name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-amber-700 mt-1 italic">If one of these belongs to this cheque, ask the CRE who collected it to re-record the payment with the correct cheque selected so the link is saved properly.</p>
                  </div>
                ) : !hasOrphan ? (
                  <p className="text-[11px] text-gray-500 italic text-center">This cheque appears to be standalone (manually added, not yet used to collect anything).</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {incomes.map(inc => <IncomeRow key={inc.income_id} inc={inc} />)}
                {Math.abs((summary.total_income_amount || 0) - (c.amount || 0)) > 0.5 && (
                  <div className="mt-2 text-[11px] text-amber-700 italic bg-amber-50 border border-amber-200 rounded p-2">
                    ⚠ Sum of linked income ({fmtMoney(summary.total_income_amount)}) does not equal the cheque amount ({fmtMoney(c.amount)}).
                  </div>
                )}
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
