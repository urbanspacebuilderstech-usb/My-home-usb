import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Wallet, Eye, ArrowDownCircle, ArrowUpCircle, Clock, Search, FileText } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s || '—'; } };

const TYPE_ICON = {
  wo: FileText,
  payment: ArrowUpCircle,
  request: ArrowDownCircle,
  suspense: Clock,
};
const TYPE_BG = {
  wo: 'bg-violet-50 text-violet-700 border-violet-200',
  payment: 'bg-green-50 text-green-700 border-green-200',
  request: 'bg-blue-50 text-blue-700 border-blue-200',
  suspense: 'bg-amber-50 text-amber-700 border-amber-200',
};
const TYPE_LABEL = {
  wo: 'Work Order',
  payment: 'Payment',
  request: 'Pending',
  suspense: 'Suspense',
};

export default function LabourContractorPaymentSummary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openContractor, setOpenContractor] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/labour-contractor-payments/summary`);
        setRows(res.data?.rows || []);
      } catch { setRows([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => (r.contractor_name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(() => filteredRows.reduce((acc, r) => ({
    total: acc.total + Number(r.total_value || 0),
    paid: acc.paid + Number(r.paid_amount || 0),
    pending_with_pm: acc.pending_with_pm + Number(r.pending_with_pm || 0),
    pending_ready: acc.pending_ready + Number(r.pending_ready || 0),
    suspense: acc.suspense + Number(r.suspense_balance || 0),
  }), { total: 0, paid: 0, pending_with_pm: 0, pending_ready: 0, suspense: 0 }), [filteredRows]);

  const openLedgerFor = async (row) => {
    setOpenContractor(row);
    setLedger([]);
    setLedgerLoading(true);
    try {
      const key = row.contractor_id || row.contractor_name;
      const res = await axios.get(`${API}/labour-contractor-payments/${encodeURIComponent(key)}/ledger`);
      setLedger(res.data?.ledger || []);
    } catch { setLedger([]); }
    finally { setLedgerLoading(false); }
  };

  return (
    <div className="space-y-3" data-testid="labour-contractor-summary">
      {/* Roll-up summary pills — Total | Paid | With PM | Ready | Suspense */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="lcs-summary-pills">
        <div className="rounded-full bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-violet-600 uppercase tracking-wider">Total WO</p>
          <p className="text-base font-bold text-violet-900" data-testid="lcs-total">{fmt(totals.total)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-green-50 to-green-100 border border-green-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-green-700 uppercase tracking-wider">Paid</p>
          <p className="text-base font-bold text-green-900" data-testid="lcs-paid">{fmt(totals.paid)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-orange-700 uppercase tracking-wider">With PM</p>
          <p className="text-base font-bold text-orange-900" data-testid="lcs-pending-pm">{fmt(totals.pending_with_pm)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-blue-700 uppercase tracking-wider">Ready to Pay</p>
          <p className="text-base font-bold text-blue-900" data-testid="lcs-pending-ready">{fmt(totals.pending_ready)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-amber-700 uppercase tracking-wider">Suspense</p>
          <p className="text-base font-bold text-amber-900" data-testid="lcs-suspense">{fmt(totals.suspense)}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4 text-violet-600" /> Labour Contractor Payment Summary
              </CardTitle>
              <CardDescription className="text-[11px]">Cross-project payment &amp; suspense overview · Accountant / Planning / Super Admin only</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contractor..."
                className="h-8 pl-8 text-xs"
                data-testid="lcs-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <p className="text-center text-xs text-gray-400 py-8">Loading...</p>
          : filteredRows.length === 0 ? <p className="text-center text-xs text-gray-400 py-10">{search ? `No contractor matches "${search}"` : 'No contractors yet'}</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-center px-3 py-2 font-semibold text-gray-600 w-12">S.No</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Contractor</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Projects</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Total WO</th>
                    <th className="text-right px-3 py-2 font-semibold text-green-700">Paid</th>
                    <th className="text-right px-3 py-2 font-semibold text-orange-700" title="Requested / PM Approved / QC Approved">With PM</th>
                    <th className="text-right px-3 py-2 font-semibold text-blue-700" title="Planning approved · awaiting Accountant">Ready to Pay</th>
                    <th className="text-right px-3 py-2 font-semibold text-amber-700">Suspense</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-20">Ledger</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRows.map((r, i) => (
                    <tr key={i} className="hover:bg-violet-50/40">
                      <td className="px-3 py-2 text-center text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.contractor_name}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">{r.contractor_type || '—'}</Badge></td>
                      <td className="px-3 py-2 text-gray-700 text-[11px]">{(r.projects || []).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.total_value)}</td>
                      <td className="px-3 py-2 text-right text-green-700 font-semibold">{fmt(r.paid_amount)}</td>
                      <td className="px-3 py-2 text-right text-orange-700">{fmt(r.pending_with_pm)}</td>
                      <td className="px-3 py-2 text-right text-blue-700 font-semibold">{fmt(r.pending_ready)}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-700">{fmt(r.suspense_balance)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => openLedgerFor(r)} data-testid={`lcs-ledger-${i}`}>
                          <Eye className="h-3 w-3" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openContractor} onOpenChange={(v) => { if (!v) { setOpenContractor(null); setLedger([]); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="lcs-ledger-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-violet-600" /> {openContractor?.contractor_name} · Activity Timeline
            </DialogTitle>
            <DialogDescription className="text-xs">
              Total <span className="font-semibold">{fmt(openContractor?.total_value)}</span>
              {' · '}Paid <span className="font-semibold text-green-700">{fmt(openContractor?.paid_amount)}</span>
              {' · '}With PM <span className="font-semibold text-orange-700">{fmt(openContractor?.pending_with_pm)}</span>
              {' · '}Ready <span className="font-semibold text-blue-700">{fmt(openContractor?.pending_ready)}</span>
              {' · '}Suspense <span className="font-semibold text-amber-700">{fmt(openContractor?.suspense_balance)}</span>
            </DialogDescription>
          </DialogHeader>
          {ledgerLoading ? (
            <p className="text-center text-xs text-gray-400 py-6">Loading timeline…</p>
          ) : ledger.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">No activity yet</p>
          ) : (
            <ol className="relative border-l-2 border-violet-100 ml-3 space-y-3 py-2">
              {ledger.map((l, i) => {
                const Icon = TYPE_ICON[l.type] || Clock;
                const amtPrefix = l.type === 'payment' ? '+' : l.type === 'suspense' ? (Number(l.amount) >= 0 ? '+' : '−') : '';
                const amtVal = l.type === 'suspense' ? Math.abs(Number(l.amount) || 0) : l.amount;
                return (
                  <li key={i} className="ml-4" data-testid={`lcs-ledger-entry-${i}`}>
                    <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full border ${TYPE_BG[l.type] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Badge variant="outline" className={`text-[9px] capitalize ${TYPE_BG[l.type] || ''}`}>{TYPE_LABEL[l.type] || l.type}</Badge>
                      <span className={`text-sm font-semibold ${l.type === 'payment' ? 'text-green-700' : l.type === 'request' ? 'text-blue-700' : l.type === 'suspense' ? 'text-amber-700' : 'text-violet-800'}`}>
                        {amtPrefix}{fmt(amtVal)}
                      </span>
                      <span className="text-[10px] text-gray-400">{fmtDateTime(l.date)}</span>
                      {l.status && <Badge variant="outline" className="text-[9px] bg-gray-50 text-gray-700 border-gray-200 capitalize">{(l.status || '').replace(/_/g, ' ')}</Badge>}
                    </div>
                    <p className="text-xs text-gray-700 mt-0.5">{l.notes}</p>
                    <div className="text-[10px] text-gray-500 mt-0.5 flex flex-wrap gap-2">
                      {l.project && <span>Project: <span className="text-gray-700">{l.project}</span></span>}
                      {l.payment_mode && <span>· Mode: <span className="text-gray-700 uppercase">{(l.payment_mode || '').replace(/_/g, ' ')}</span></span>}
                      {l.reference && <span>· Ref: <span className="text-gray-700">{l.reference}</span></span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
