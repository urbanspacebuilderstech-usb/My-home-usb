import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, Eye, ArrowDownCircle, ArrowUpCircle, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s || '—'; } };

const TYPE_ICON = {
  payment: ArrowUpCircle,
  request: ArrowDownCircle,
  credit: Clock,
  suspense: Clock,
};
const TYPE_BG = {
  payment: 'bg-green-50 text-green-700 border-green-200',
  request: 'bg-blue-50 text-blue-700 border-blue-200',
  credit: 'bg-amber-50 text-amber-700 border-amber-200',
  suspense: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function MaterialVendorPaymentSummary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openVendor, setOpenVendor] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/material-vendor-payments/summary`);
        setRows(res.data?.rows || []);
      } catch { setRows([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const openLedgerFor = async (row) => {
    setOpenVendor(row);
    setLedger([]);
    setLedgerLoading(true);
    try {
      const key = row._key || row.vendor_id || `name:${(row.vendor_name || '').toLowerCase()}`;
      const res = await axios.get(`${API}/material-vendor-payments/${encodeURIComponent(key)}/ledger`);
      setLedger(res.data?.ledger || []);
    } catch { setLedger([]); }
    finally { setLedgerLoading(false); }
  };

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    total: acc.total + Number(r.total_value || 0),
    paid: acc.paid + Number(r.paid_amount || 0),
    pending: acc.pending + Number(r.pending_amount || 0),
    suspense: acc.suspense + Number(r.suspense_balance || 0),
  }), { total: 0, paid: 0, pending: 0, suspense: 0 }), [rows]);

  return (
    <div className="space-y-3" data-testid="material-vendor-summary">
      {/* Roll-up summary pills — Total | Paid | Pending | Suspense */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="mv-summary-pills">
        <div className="rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider">Total</p>
          <p className="text-base font-bold text-blue-900" data-testid="mv-total">{fmt(totals.total)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-green-50 to-green-100 border border-green-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-green-700 uppercase tracking-wider">Paid</p>
          <p className="text-base font-bold text-green-900" data-testid="mv-paid">{fmt(totals.paid)}</p>
        </div>
        <div className="rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 px-4 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-indigo-700 uppercase tracking-wider">Pending</p>
          <p className="text-base font-bold text-indigo-900" data-testid="mv-pending">{fmt(totals.pending)}</p>
        </div>
        <div className={`rounded-full bg-gradient-to-br ${totals.suspense < 0 ? 'from-rose-50 to-rose-100 border-rose-200' : 'from-amber-50 to-amber-100 border-amber-200'} border px-4 py-2.5 shadow-sm`}>
          <p className={`text-[9px] font-semibold uppercase tracking-wider ${totals.suspense < 0 ? 'text-rose-700' : 'text-amber-700'}`}>Suspense</p>
          <p className={`text-base font-bold ${totals.suspense < 0 ? 'text-rose-900' : 'text-amber-900'}`} data-testid="mv-suspense">{fmt(totals.suspense)}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" /> Material Vendor Payment Summary
          </CardTitle>
          <CardDescription className="text-[11px]">Cross-project material vendor payment & suspense overview · Accountant / Planning / Procurement / Super Admin only</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <p className="text-center text-xs text-gray-400 py-8">Loading...</p>
          : rows.length === 0 ? <p className="text-center text-xs text-gray-400 py-10">No material vendors yet</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-center px-3 py-2 font-semibold text-gray-600 w-12">S.No</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Vendor</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Projects</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Total</th>
                    <th className="text-right px-3 py-2 font-semibold text-green-700">Paid</th>
                    <th className="text-right px-3 py-2 font-semibold text-blue-700">Pending</th>
                    <th className="text-right px-3 py-2 font-semibold text-amber-700">Suspense</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-20">Ledger</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={r._key || i} className="hover:bg-blue-50/40" data-testid={`mv-row-${i}`}>
                      <td className="px-3 py-2 text-center text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.vendor_name}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 capitalize">{r.vendor_type || 'Material'}</Badge></td>
                      <td className="px-3 py-2 text-gray-700 text-[11px] max-w-[260px]" title={(r.projects || []).join(', ')}>
                        {(r.projects || []).slice(0, 3).join(', ')}{(r.projects || []).length > 3 ? ` +${r.projects.length - 3} more` : ''}{!r.projects?.length && '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(r.total_value)}</td>
                      <td className="px-3 py-2 text-right text-green-700 font-semibold">{fmt(r.paid_amount)}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{fmt(r.pending_amount)}</td>
                      <td className="px-3 py-2 text-right font-bold" data-testid={`mv-suspense-${i}`}>
                        <span className={Number(r.suspense_balance || 0) < 0 ? 'text-rose-700' : Number(r.suspense_balance || 0) > 0 ? 'text-amber-700' : 'text-gray-400'}>
                          {fmt(r.suspense_balance)}
                        </span>
                        {Number(r.suspense_balance || 0) < 0 && <p className="text-[9px] text-rose-600 font-normal mt-0.5">vendor owes</p>}
                        {Number(r.suspense_balance || 0) > 0 && <p className="text-[9px] text-amber-600 font-normal mt-0.5">credit avl.</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => openLedgerFor(r)} data-testid={`mv-ledger-btn-${i}`}>
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

      <Dialog open={!!openVendor} onOpenChange={(v) => { if (!v) { setOpenVendor(null); setLedger([]); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="mv-ledger-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" /> {openVendor?.vendor_name} · Activity Timeline
            </DialogTitle>
            <DialogDescription className="text-xs">
              Total <span className="font-semibold">{fmt(openVendor?.total_value)}</span>
              {' · '}Paid <span className="font-semibold text-green-700">{fmt(openVendor?.paid_amount)}</span>
              {' · '}Pending <span className="font-semibold text-blue-700">{fmt(openVendor?.pending_amount)}</span>
              {' · '}Suspense <span className="font-semibold text-amber-700">{fmt(openVendor?.suspense_balance)}</span>
            </DialogDescription>
          </DialogHeader>
          {ledgerLoading ? (
            <p className="text-center text-xs text-gray-400 py-6">Loading timeline…</p>
          ) : ledger.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">No activity yet</p>
          ) : (
            <ol className="relative border-l-2 border-blue-100 ml-3 space-y-3 py-2">
              {ledger.map((l, i) => {
                const Icon = TYPE_ICON[l.type] || Clock;
                return (
                  <li key={i} className="ml-4">
                    <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full border ${TYPE_BG[l.type] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Badge variant="outline" className={`text-[9px] capitalize ${TYPE_BG[l.type] || ''}`}>{l.type}</Badge>
                      <span className={`text-sm font-semibold ${l.type === 'payment' ? 'text-green-700' : l.type === 'credit' ? 'text-amber-700' : 'text-blue-700'}`}>
                        {l.type === 'payment' ? '+' : l.type === 'credit' ? '⏳' : ''}{fmt(l.amount)}
                      </span>
                      <span className="text-[10px] text-gray-400">{fmtDateTime(l.date)}</span>
                      {l.status && <Badge variant="outline" className="text-[9px] bg-gray-50 text-gray-700 border-gray-200 capitalize">{(l.status || '').replace(/_/g, ' ')}</Badge>}
                    </div>
                    <p className="text-xs text-gray-700 mt-0.5">{l.notes}</p>
                    <div className="text-[10px] text-gray-500 mt-0.5 flex flex-wrap gap-2">
                      {l.project && <span>Project: <span className="text-gray-700">{l.project}</span></span>}
                      {l.material && <span>· Material: <span className="text-gray-700">{l.material}</span></span>}
                      {l.payment_mode && <span>· Mode: <span className="text-gray-700 uppercase">{(l.payment_mode || '').replace(/_/g, ' ')}</span></span>}
                      {l.reference && <span>· Ref: <span className="text-gray-700">{l.reference}</span></span>}
                      {l.due_date && <span>· Due: <span className="text-gray-700">{(l.due_date || '').slice(0, 10)}</span></span>}
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
