import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { RefreshCw, Search } from 'lucide-react';
import { Card, CardContent } from './ui/card';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtFull = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const PlainAmount = ({ value, className = '' }) => <span className={className}>{fmtFull(value)}</span>;

const COLUMNS = [
  { key: 'scope_value', label: 'Scope Value', cls: 'text-blue-700', accent: 'border-l-blue-500', title: 'Agreed scope value of the project' },
  { key: 'receivable', label: 'Balance Receivable', cls: 'text-amber-700', accent: 'border-l-amber-500', title: 'Still to be received from the client: Grand Total (Scope + Additions − Deductions) − Income received' },
  { key: 'material_payable', label: 'Material Payable', cls: 'text-red-700', accent: 'border-l-red-500', title: 'Still to be paid to vendors for material ordered (after Planning approval), including Partial balances and credit purchases' },
  { key: 'labour_payable', label: 'Labour Payable', cls: 'text-orange-700', accent: 'border-l-orange-500', title: 'Still to be paid to contractors: active work order value − stage payments released − approved advances' },
  { key: 'funds_in_hand', label: 'Funds in Hand', cls: '', accent: '', title: 'Client money left after spending: Income received − Expense, all-time incl. Carry Forward' },
];

/**
 * Oct 15 2026 — Finance Board > Project Wise > Balance. One row per project,
 * all-time: what the client still owes, what we still owe vendors and
 * contractors, and how much of the client's money is left unspent.
 *
 * Scope Value / Balance Receivable / Funds in Hand come from the all-time
 * /accountant/cashbook-filtered project_wise rows, the same source and
 * formulas as the Overview table (Receivable = grand_total − income,
 * Funds in Hand = its balance). Material / Labour Payable come from
 * /accountant/project-wise/balance-summary.
 *
 * The summary cards above the table repeat the Total row, so both follow
 * the project search.
 *
 * `Amount` renders a money value; AccountsBoard passes its MaskedValue so an
 * Accountant sees the same masking as on the Overview.
 */
export default function ProjectWiseBalanceTab({ Amount = PlainAmount }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cb, bal] = await Promise.all([
          axios.get(`${API}/accountant/cashbook-filtered`),
          axios.get(`${API}/accountant/project-wise/balance-summary`),
        ]);
        const payables = new Map((bal.data?.rows || []).map(r => [r.project_id, r]));
        const merged = (cb.data?.project_wise || []).map(p => {
          const pay = payables.get(p.project_id) || {};
          return {
            project_id: p.project_id,
            project_name: (p.project_name || '').replace(/\s+/g, ' ').trim(),
            scope_value: p.scope_value || 0,
            receivable: round2((p.grand_total || 0) - (p.income || 0)),
            material_payable: pay.material_payable || 0,
            labour_payable: pay.labour_payable || 0,
            funds_in_hand: p.balance || 0,
          };
        });
        if (!cancelled) setRows(merged);
      } catch {
        if (!cancelled) {
          setRows([]);
          toast.error('Failed to load project balances');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const q = normalize(search);
  const filtered = q ? rows.filter(r => normalize(r.project_name).includes(q)) : rows;
  const totals = COLUMNS.reduce((acc, c) => {
    acc[c.key] = round2(filtered.reduce((s, r) => s + (r[c.key] || 0), 0));
    return acc;
  }, {});
  const fundsCls = (v) => (v >= 0 ? 'text-green-700' : 'text-red-600');
  const fundsAccent = (v) => (v >= 0 ? 'border-l-green-500' : 'border-l-red-500');

  return (
    <div className="space-y-3" data-testid="pw-balance-tab">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500">All-time figures for every project. Hover a heading to see how it is worked out.</p>
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />}
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project name..."
                data-testid="pw-balance-search"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3" data-testid="pw-balance-summary">
          {COLUMNS.map(c => {
            const isFunds = c.key === 'funds_in_hand';
            const cls = isFunds ? fundsCls(totals[c.key]) : c.cls;
            const accent = isFunds ? fundsAccent(totals[c.key]) : c.accent;
            return (
              <Card key={c.key} title={c.title} className={`border-l-4 ${accent} ${isFunds ? 'col-span-2 lg:col-span-1' : ''}`} data-testid={`pw-balance-card-${c.key}`}>
                <CardContent className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-500">{c.label}</p>
                  <p className={`text-base sm:text-lg font-bold whitespace-nowrap ${cls}`}>
                    <Amount value={totals[c.key]} className={cls} />
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="pw-balance-table">
            <thead className="bg-gray-50 border-y">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">S.No</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Project</th>
                {COLUMNS.map(c => (
                  <th key={c.key} title={c.title} className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase cursor-help whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 2} className="px-3 py-8 text-center text-gray-400 text-sm">{loading ? 'Loading…' : 'No projects found'}</td></tr>
              ) : filtered.map((r, idx) => (
                <tr key={r.project_id} className="hover:bg-gray-50" data-testid={`pw-balance-row-${idx}`}>
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.project_name}</td>
                  {COLUMNS.map(c => {
                    const cls = c.key === 'funds_in_hand' ? fundsCls(r[c.key]) : c.cls;
                    return (
                      <td key={c.key} className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${cls}`}>
                        <Amount value={r[c.key]} className={cls} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Total ({filtered.length} projects)</td>
                  {COLUMNS.map(c => {
                    const cls = c.key === 'funds_in_hand' ? fundsCls(totals[c.key]) : c.cls;
                    return (
                      <td key={c.key} className={`px-3 py-2 text-right whitespace-nowrap ${cls}`}>
                        <Amount value={totals[c.key]} className={cls} />
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
