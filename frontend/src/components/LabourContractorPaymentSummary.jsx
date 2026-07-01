import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Wallet, Eye, Search } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

export default function LabourContractorPaymentSummary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openLedger, setOpenLedger] = useState(null);
  const [ledger, setLedger] = useState([]);
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
    pending: acc.pending + Number(r.pending_amount || 0),
    suspense: acc.suspense + Number(r.suspense_balance || 0),
  }), { total: 0, paid: 0, pending: 0, suspense: 0 }), [filteredRows]);

  const openLedgerFor = async (row) => {
    setOpenLedger(row);
    if (!row.contractor_id) { setLedger([]); return; }
    try {
      const res = await axios.get(`${API}/contractors/${row.contractor_id}/suspense`);
      setLedger(res.data?.ledger || []);
    } catch { setLedger([]); }
  };

  return (
    <div className="space-y-3" data-testid="labour-contractor-summary">
      {/* Roll-up summary pills — Total | Paid | Pending | Suspense */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="lcs-summary-pills">
        <div className="rounded-full bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-violet-600 uppercase tracking-wider">Total WO</p>
          <p className="text-base font-bold text-violet-900" data-testid="lcs-total">{fmt(totals.total)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-green-50 to-green-100 border border-green-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-green-700 uppercase tracking-wider">Paid</p>
          <p className="text-base font-bold text-green-900" data-testid="lcs-paid">{fmt(totals.paid)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-blue-700 uppercase tracking-wider">Pending</p>
          <p className="text-base font-bold text-blue-900" data-testid="lcs-pending">{fmt(totals.pending)}</p>
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
              <CardDescription className="text-[11px]">Cross-project payment & suspense overview · Accountant / Planning / Super Admin only</CardDescription>
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
                    <th className="text-right px-3 py-2 font-semibold text-blue-700">Pending</th>
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
                      <td className="px-3 py-2 text-right text-blue-700">{fmt(r.pending_amount)}</td>
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

      <Dialog open={!!openLedger} onOpenChange={(v) => { if (!v) { setOpenLedger(null); setLedger([]); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="lcs-dialog">
          <DialogHeader>
            <DialogTitle className="text-base">{openLedger?.contractor_name} · Suspense Ledger</DialogTitle>
            <DialogDescription className="text-xs">Current Balance: <span className="font-bold text-amber-700">{fmt(openLedger?.suspense_balance)}</span></DialogDescription>
          </DialogHeader>
          {ledger.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">No suspense entries</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-y">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ledger.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.date)}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className={`text-[9px] ${l.type === 'credit' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{l.type}</Badge></td>
                    <td className="px-3 py-2 capitalize text-gray-600">{(l.source_type || '').replace('_', ' ')}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${l.type === 'credit' ? 'text-green-700' : 'text-red-700'}`}>{l.type === 'credit' ? '+' : '−'}{fmt(l.amount)}</td>
                    <td className="px-3 py-2 text-gray-600 text-[11px]">{l.notes || '—'}{l.cheque_no ? ` (Chq ${l.cheque_no})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
