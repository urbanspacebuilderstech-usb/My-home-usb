import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Nov 23 2026 — Accounts → Project Wise → Material CC, all time.
//   Direct Expenses = Direct Out on Project Cost Control.
//   Material / Labour: Theoretical (Planning's entry) against Purchase, from
//   /accountant/project-wise/material-cc. Items have different units, so a
//   project row shows only how many items it has and their rate-weighted
//   Difference %; opening it lists each item in its own unit.

const money0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const EMPTY = { items: [], count: 0, compared: 0, diff_pct: null };

const withUnit = (n, unit) => (n == null ? '—' : `${qtyFmt.format(n)}${unit ? ` ${unit}` : ''}`);
// Over plan is the problem, so it is red; under or on plan is green.
const diffCls = (d) => (d > 0 ? 'text-red-600' : 'text-emerald-700');
const diffText = (d) => `${d > 0 ? '+' : ''}${qtyFmt.format(d)}%`;
const NOTES = {
  no_plan: { label: 'No plan', title: 'Bought, but no theoretical quantity is entered for it' },
  unit_mismatch: { label: 'Unit differs', title: 'Planned and bought in different units, so they cannot be compared' },
};

const GROUPS = [
  { key: 'material', label: 'Material', head: 'bg-emerald-50 text-emerald-700 border-emerald-100', sub: 'bg-emerald-50/60', cell: 'bg-emerald-50/30', line: 'border-emerald-100' },
  { key: 'labour', label: 'Labour', head: 'bg-violet-50 text-violet-700 border-violet-100', sub: 'bg-violet-50/60', cell: 'bg-violet-50/30', line: 'border-violet-100' },
];

const td = 'px-2 py-2 text-center whitespace-nowrap';
const th = 'px-2 py-1.5 font-medium';

function DiffCell({ item }) {
  if (item.diff_pct != null) return <span className={`font-semibold ${diffCls(item.diff_pct)}`}>{diffText(item.diff_pct)}</span>;
  const note = NOTES[item.note];
  return note ? <span className="text-[11px] text-amber-700" title={note.title}>{note.label}</span> : '—';
}

export default function MaterialCCTab({ allowedProjectIds = null, Amount }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    // All-time on purpose, like Project Cost Control.
    Promise.all([
      axios.get(`${API}/accountant/cashbook-filtered`),
      axios.get(`${API}/accountant/project-wise/material-cc`).catch(() => {
        if (!cancelled) toast.error('Could not load quantities');
        return { data: {} };
      }),
    ]).then(([cb, q]) => {
      if (cancelled) return;
      setProjects(cb.data?.project_wise || []);
      setQuantities(q.data?.projects || {});
    }).catch(() => {
      if (!cancelled) toast.error('Could not load project figures');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const q = norm(search);
    return projects
      .filter((p) => !allowedProjectIds || allowedProjectIds.has(p.project_id))
      .filter((p) => !q || norm(p.project_name).includes(q))
      .map((p) => ({
        ...p,
        direct: Number(p.direct_expense || 0),
        material: quantities[p.project_id]?.material || EMPTY,
        labour: quantities[p.project_id]?.labour || EMPTY,
      }));
  }, [projects, quantities, search, allowedProjectIds]);

  const total = rows.reduce((s, r) => s + r.direct, 0);
  const Money = ({ v, cls = '' }) => (
    Amount ? <Amount value={Math.round(v)} className={cls} /> : <span className={cls}>{money0.format(Math.round(v))}</span>
  );
  const toggle = (pid) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });

  return (
    <div className="space-y-4" data-testid="material-cc-tab">
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            Theoretical is entered by Planning on the project&apos;s Materials tab. Click a project&apos;s arrow to see each item in its own unit.
          </p>
          <div className="relative w-full sm:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project name..." className="pl-9" data-testid="mcc-search" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="mcc-table">
              <thead className="bg-gray-50 border-b">
                <tr className="text-[11px] uppercase text-gray-500">
                  <th rowSpan={2} className={`${th} text-center align-bottom w-16`}>S.No</th>
                  <th rowSpan={2} className={`${th} text-left align-bottom`}>Project</th>
                  <th rowSpan={2} className={`${th} text-center align-bottom`}>Direct<br />Expenses</th>
                  {GROUPS.map((g) => (
                    <th key={g.key} colSpan={3} className={`${th} text-center border-l ${g.head}`}>{g.label}</th>
                  ))}
                </tr>
                <tr className="text-[11px] uppercase text-gray-500">
                  {GROUPS.map((g) => (
                    <Fragment key={g.key}>
                      <th className={`${th} text-center border-l ${g.sub} ${g.line}`}>Theoretical<br />Quantity</th>
                      <th className={`${th} text-center ${g.sub}`}>Purchase<br />Quantity</th>
                      <th className={`${th} text-center ${g.sub}`}>Difference<br />%</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No projects found</td></tr>
                ) : rows.map((r, i) => {
                  const isOpen = open.has(r.project_id);
                  const lines = Math.max(r.material.items.length, r.labour.items.length);
                  return (
                    <Fragment key={r.project_id || i}>
                      <tr className="hover:bg-gray-50">
                        <td className={`${td} text-gray-400`}>
                          <span className="inline-flex items-center gap-1">
                            {lines > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggle(r.project_id)}
                                aria-expanded={isOpen}
                                aria-label={`${isOpen ? 'Hide' : 'Show'} items of ${r.project_name || 'project'}`}
                                className="p-0.5 rounded hover:bg-gray-200 text-gray-600"
                                data-testid="mcc-expand"
                              >
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            ) : <span className="w-[18px]" />}
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => r.project_id && navigate(`/projects/${r.project_id}`)}
                            className="text-blue-700 hover:underline text-left font-medium"
                          >
                            {r.project_name || '-'}
                          </button>
                        </td>
                        <td className={`${td} font-semibold`} data-testid="mcc-direct"><Money v={r.direct} cls="text-red-600" /></td>
                        {GROUPS.map((g) => {
                          const s = r[g.key];
                          const planned = s.items.filter((x) => x.theoretical).length;
                          const bought = s.items.filter((x) => x.purchase > 0).length;
                          return (
                            <Fragment key={g.key}>
                              <td className={`${td} border-l text-gray-500 ${g.cell} ${g.line}`}>{planned ? `${planned} item${planned > 1 ? 's' : ''}` : '—'}</td>
                              <td className={`${td} text-gray-500 ${g.cell}`}>{bought ? `${bought} item${bought > 1 ? 's' : ''}` : '—'}</td>
                              <td className={`${td} font-bold ${g.cell}`} title={s.compared ? `Weighted by rate over ${s.compared} of ${s.count} items` : undefined}>
                                {s.diff_pct != null ? <span className={diffCls(s.diff_pct)}>{diffText(s.diff_pct)}</span> : '—'}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                      {isOpen && Array.from({ length: lines }, (_, n) => (
                        <tr key={`${r.project_id}-${n}`} className="bg-white" data-testid="mcc-item-row">
                          <td colSpan={3} className="bg-gray-50/60" />
                          {GROUPS.map((g) => {
                            const x = r[g.key].items[n];
                            if (!x) return <td key={g.key} colSpan={3} className={`border-l ${g.cell} ${g.line}`} />;
                            return (
                              <Fragment key={g.key}>
                                <td className={`px-2 py-1.5 border-l ${g.cell} ${g.line}`}>
                                  <div className="flex items-baseline justify-between gap-3">
                                    <span className="font-medium text-gray-800">{x.name}</span>
                                    <span className="whitespace-nowrap">{withUnit(x.theoretical, x.unit)}</span>
                                  </div>
                                </td>
                                <td className={`px-2 py-1.5 text-center whitespace-nowrap ${g.cell}`}>
                                  {x.purchase > 0 ? withUnit(x.purchase, x.actual_unit || x.unit) : '—'}
                                  {x.awaiting > 0 && (
                                    <span className="block text-[10px] text-amber-700" title="Received on site, Purchasing has not verified it yet">
                                      +{withUnit(x.awaiting, x.actual_unit || x.unit)} to verify
                                    </span>
                                  )}
                                </td>
                                <td className={`px-2 py-1.5 text-center whitespace-nowrap ${g.cell}`}><DiffCell item={x} /></td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot className="border-t font-semibold">
                  <tr className="bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap" colSpan={2}>Total ({rows.length})</td>
                    <td className={td}><Money v={total} cls="text-red-600" /></td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
