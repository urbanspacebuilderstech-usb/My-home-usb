import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Package, Search, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import MaterialSearchSelect from './MaterialSearchSelect';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const formatCurrency = (a) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);
const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Oct 6 2026 — Project-wise Inventory dashboard (value pills + per-request
 * stock table + rate-breakdown popup). Lifted out of Planning > Dashboard >
 * DLR & DPR > Inventory so Finance Board > Project Wise > Material renders
 * the exact same screen off the same /planning/inventory-summary rows,
 * instead of a second rollup that can drift from Planning's numbers.
 *
 * `onRowClick(row)` — optional; rows are only clickable when it's passed.
 */
export default function InventorySummaryPanel({ scopeLabel = 'All Projects', onRowClick }) {
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState([]); // array of selected material names (multi-select)
  // Aug 27 2026 — Payment filter: paid / partial (advance paid, balance
  // due) / unpaid, derived server-side from each request's own
  // advance_amount/balance_amount (see site_ops.py's _material_payment_status).
  const [paymentFilter, setPaymentFilter] = useState(''); // '' = All
  const [rateBreakdown, setRateBreakdown] = useState({ open: false, projectName: '', materialName: '', requestNumber: '', loading: false, data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/planning/inventory-summary`, { params: { start_date: startDate, end_date: endDate } });
        if (!cancelled) setRows(res.data?.rows || []);
      } catch {
        if (!cancelled) {
          setRows([]);
          toast.error('Failed to load Inventory summary');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const openRateBreakdown = async (projectId, projectName, materialName, requestNumber = '') => {
    setRateBreakdown({ open: true, projectName, materialName, requestNumber, loading: true, data: null });
    try {
      const params = { project_id: projectId, material_name: materialName };
      if (requestNumber) params.request_number = requestNumber;
      const res = await axios.get(`${API}/planning/material-rate-breakdown`, { params });
      setRateBreakdown(s => ({ ...s, loading: false, data: res.data }));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load rate breakdown');
      setRateBreakdown(s => ({ ...s, loading: false, data: { rows: [] } }));
    }
  };

  const materials = useMemo(() => {
    const matMap = {};
    rows.forEach(r => {
      if (!r.material_name) return;
      const m = matMap[r.material_name] || (matMap[r.material_name] = { name: r.material_name, unit: r.unit, qty: 0, count: 0, amount: 0 });
      m.qty += Number(r.current_stock) || 0;
      m.count += 1;
      m.amount += (Number(r.current_stock) || 0) * (Number(r.unit_rate) || 0);
    });
    return Object.values(matMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const materialSearchLower = materialSearch.map(n => n.toLowerCase());
  const filteredRows = rows.filter(r =>
    (!projectSearch || r.project_name.toLowerCase().includes(projectSearch.toLowerCase())) &&
    (materialSearchLower.length === 0 || materialSearchLower.includes((r.material_name || '').toLowerCase())) &&
    (!paymentFilter || r.payment_status === paymentFilter) &&
    // Aug 29 2026 — a fully-paid, fully-used row (0 stock) has
    // nothing left to track, so it's hidden to declutter the
    // list. Unpaid/Partial rows stay visible even at 0 stock —
    // money is still owed on them, so Accounts still needs to
    // see them regardless of stock level.
    !(Number(r.current_stock) === 0 && r.payment_status === 'paid')
  );
  const totals = filteredRows.reduce((acc, r) => {
    const rate = Number(r.unit_rate) || 0;
    acc.stock += r.current_sv != null ? Number(r.current_sv) || 0 : (Number(r.current_stock) || 0) * rate;
    acc.in += (Number(r.today_in) || 0) * rate;
    acc.out += (Number(r.today_out) || 0) * rate;
    return acc;
  }, { stock: 0, in: 0, out: 0 });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Package className="h-5 w-5 text-indigo-600" /> Inventory — {scopeLabel}</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Project-wise current stock, unit rate, plus stock-in and stock-out for the selected date range.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search project..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-8 h-9 w-48 text-sm"
                  data-testid="inv-summary-project-search"
                />
              </div>
              <MaterialSearchSelect
                materials={materials}
                value={materialSearch}
                onChange={setMaterialSearch}
                placeholder="Search Material"
                testId="inv-summary-material-search"
                width="w-56"
                accent="indigo"
                multiple
              />
              <Select value={paymentFilter || 'all'} onValueChange={(v) => setPaymentFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-40 text-sm" data-testid="inv-summary-payment-filter">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial (Advance Paid)</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500">Start Date</Label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 px-2 border rounded-md text-sm"
                  data-testid="inv-summary-start-date-picker"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500">End Date</Label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 px-2 border rounded-md text-sm"
                  data-testid="inv-summary-end-date-picker"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm" data-testid="inv-summary-empty">
              {projectSearch || materialSearch.length > 0 || paymentFilter ? 'No matching results.' : 'No inventory recorded yet.'}
            </p>
          ) : (
            <>
              <div className="flex gap-1.5 sm:gap-3 px-4 pb-4 pt-1 overflow-x-auto" data-testid="inv-summary-value-pills">
                {[
                  { label: 'Current Stock Value', value: formatCurrency(totals.stock), cls: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                  { label: 'Today In Value', value: formatCurrency(totals.in), cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                  { label: 'Today Out Value', value: formatCurrency(totals.out), cls: 'bg-red-50 border-red-200 text-red-700' },
                ].map(p => (
                  <div key={p.label} className={`flex-1 min-w-0 flex flex-col items-center justify-center rounded-2xl px-2 py-3 sm:py-5 shadow-sm border ${p.cls}`}>
                    <span className="text-[9px] sm:text-xs font-medium text-center leading-tight">{p.label}</span>
                    <span className="text-base sm:text-2xl font-bold mt-0.5">{p.value}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto" data-testid="inv-summary-table">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-y">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">S.No</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Project</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Request</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Payment</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Unit</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Unit (Rate)</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Current SV</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Current Stock</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Today In</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Today Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRows.map((row, idx) => (
                      <tr
                        key={`${row.project_id}-${row.material_name}-${row.request_number || idx}`}
                        className={onRowClick ? 'hover:bg-indigo-50/50 cursor-pointer' : 'hover:bg-gray-50'}
                        data-testid={`inv-summary-row-${idx}`}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{row.project_name}</td>
                        <td className="px-3 py-2 text-gray-700">{row.material_name}</td>
                        <td className="px-3 py-2 text-gray-500 font-mono text-[11px]">{row.request_number || '—'}</td>
                        <td className="px-3 py-2">
                          {row.payment_status === 'paid' ? (
                            <span className="inline-flex text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Paid</span>
                          ) : row.payment_status === 'partial' ? (
                            <span className="inline-flex text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Partial</span>
                          ) : (
                            <span className="inline-flex text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Unpaid</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{row.unit || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          <span className="inline-flex items-center gap-1 justify-end">
                            {row.unit_rate > 0 ? formatCurrency(row.unit_rate) : '—'}
                            {/* The stored unit_price was a lump-sum bill, not a
                                per-unit rate, so this was re-derived from the
                                request's own total. Flagged rather than swapped
                                silently — Procurement's Unit Price column still
                                shows the raw figure. */}
                            {row.rate_reconciled && (
                              <span
                                className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded"
                                title={`Derived from this request's total. Stored unit price is ${formatCurrency(row.stored_unit_rate)}, which does not match the billed amount.`}
                              >
                                adj
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openRateBreakdown(row.project_id, row.project_name, row.material_name, row.request_number); }}
                              className="text-gray-300 hover:text-indigo-600"
                              title="See this request's own rate detail and Out Stock history"
                              data-testid={`inv-rate-info-${row.project_id}-${row.material_name}`}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-indigo-700 font-medium whitespace-nowrap">
                          {row.current_sv != null ? formatCurrency(row.current_sv) : (row.unit_rate > 0 ? formatCurrency((Number(row.current_stock) || 0) * row.unit_rate) : '—')}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{Math.round(Number(row.current_stock) || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{(() => { const v = Math.round(Number(row.today_in) || 0); return v > 0 ? `+${v.toLocaleString('en-IN')}` : v; })()}</td>
                        <td className="px-3 py-2 text-right text-red-700">{(() => { const v = Math.round(Number(row.today_out) || 0); return v > 0 ? `-${v.toLocaleString('en-IN')}` : v; })()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Rate breakdown — every material_requests/material_expenses row that
          feeds the weighted-average Unit (Rate) shown above, so a single
          bad price/qty entry can be spotted instead of guessing at the formula. */}
      <Dialog open={rateBreakdown.open} onOpenChange={(o) => !o && setRateBreakdown(s => ({ ...s, open: false }))}>
        <DialogContent className="max-w-2xl" data-testid="inv-rate-breakdown-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Info className="h-5 w-5" /> {rateBreakdown.requestNumber ? `${rateBreakdown.requestNumber} Detail` : 'Rate Breakdown'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {rateBreakdown.materialName} · {rateBreakdown.projectName} — {rateBreakdown.requestNumber ? `this request's own rate, plus every Out Stock consumption for ${rateBreakdown.materialName}.` : 'full history: requests/bills that set the rate, plus every Out Stock consumption.'}
            </DialogDescription>
          </DialogHeader>
          {rateBreakdown.loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div>
          ) : !rateBreakdown.data?.rows?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">No contributing records found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-y">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Source</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Ref</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 uppercase">Qty</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 uppercase">Price</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 uppercase">Rate</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rateBreakdown.data.rows.map((r, i) => {
                      const isConsumption = r.source === 'consumption';
                      const sourceLabel = isConsumption ? 'Out Stock' : (r.source === 'material_requests' ? 'Request' : 'Expense');
                      return (
                        <tr key={i} className={!isConsumption && r.rate && Math.abs(r.rate - rateBreakdown.data.average_rate) > rateBreakdown.data.average_rate ? 'bg-red-50' : ''}>
                          <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{r.date ? String(r.date).slice(0, 10) : '—'}</td>
                          <td className={`px-2 py-1.5 ${isConsumption ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{sourceLabel}</td>
                          <td className="px-2 py-1.5 font-mono text-gray-700">{r.label || '—'}</td>
                          <td className={`px-2 py-1.5 text-right ${isConsumption ? 'text-red-600' : ''}`}>{isConsumption ? '-' : ''}{r.quantity.toLocaleString('en-IN')}</td>
                          <td className="px-2 py-1.5 text-right">{r.price != null ? formatCurrency(r.price) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{r.rate != null ? formatCurrency(r.rate) : '—'}</td>
                          <td className="px-2 py-1.5 text-gray-500 capitalize">{(r.status || '').replace(/_/g, ' ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded px-3 py-2 flex items-center justify-between text-sm mt-2">
                <span className="text-indigo-700 font-medium">{rateBreakdown.requestNumber ? 'Rate' : 'Weighted Average Rate'}</span>
                <span className="font-bold text-indigo-800">{formatCurrency(rateBreakdown.data.average_rate)}</span>
              </div>
              {!rateBreakdown.requestNumber && (
                <p className="text-[11px] text-gray-400 mt-1">Rows highlighted in red are far from the average — likely the source of an incorrect rate.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
