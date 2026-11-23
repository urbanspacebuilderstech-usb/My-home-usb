import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Nov 23 2026 — Accounts → Project Wise → Material CC, all time.
//   Direct Expenses = Direct Out on Project Cost Control.
//   Material / Labour: Theoretical (Planning's entry) against Purchase, from
//   /accountant/project-wise/material-cc. Items have different units, so a
//   project row shows only how many items it has and their rate-weighted
//   Difference %; clicking the project opens its own page (Material CC |
//   Labour CC) listing each item in its own unit.

const money0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const EMPTY = { items: [], count: 0, compared: 0, diff_pct: null };

const withUnit = (n, unit) => (n == null ? '—' : `${qtyFmt.format(n)}${unit ? ` ${unit}` : ''}`);
const itemCount = (n) => (n ? `${n} item${n > 1 ? 's' : ''}` : '—');
const plannedCount = (g) => g.items.filter((x) => x.theoretical).length;
const boughtCount = (g) => g.items.filter((x) => x.purchase > 0).length;
// Over plan is the problem, so it is red; under or on plan is green.
const diffCls = (d) => (d > 0 ? 'text-red-600' : 'text-emerald-700');
const diffText = (d) => `${d > 0 ? '+' : ''}${qtyFmt.format(d)}%`;
const NOTES = {
  no_plan: { label: 'No plan', title: 'Bought, but no theoretical quantity is entered for it' },
  unit_mismatch: { label: 'Unit differs', title: 'Planned and bought in different units, so they cannot be compared' },
};

const GROUPS = [
  { key: 'material', label: 'Material', tab: 'Material CC', item: 'Material', head: 'bg-emerald-50 text-emerald-700 border-emerald-100', sub: 'bg-emerald-50/60', cell: 'bg-emerald-50/30', line: 'border-emerald-100' },
  { key: 'labour', label: 'Labour', tab: 'Labour CC', item: 'Work Item', head: 'bg-violet-50 text-violet-700 border-violet-100', sub: 'bg-violet-50/60', cell: 'bg-violet-50/30', line: 'border-violet-100' },
];

const td = 'px-2 py-2 text-center whitespace-nowrap';
const th = 'px-2 py-1.5 font-medium';

function DiffCell({ item }) {
  if (item.diff_pct != null) return <span className={`font-semibold ${diffCls(item.diff_pct)}`}>{diffText(item.diff_pct)}</span>;
  const note = NOTES[item.note];
  return note ? <span className="text-[11px] text-amber-700" title={note.title}>{note.label}</span> : '—';
}

// One group's items on a project's page.
function ItemsTable({ group, data }) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();
  const rows = data.items.filter((x) => !q || x.name.toLowerCase().includes(q));
  const hasDiff = data.diff_pct != null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-gray-500">Theoretical</p>
          <p className="text-lg font-bold">{itemCount(plannedCount(data))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-gray-500">Purchased</p>
          <p className="text-lg font-bold">{itemCount(boughtCount(data))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-gray-500">Difference %</p>
          <p className={`text-lg font-bold ${hasDiff ? diffCls(data.diff_pct) : 'text-gray-400'}`}>{hasDiff ? diffText(data.diff_pct) : '—'}</p>
          {hasDiff && <p className="text-[11px] text-gray-500">Weighted by rate over {data.compared} of {data.count} items</p>}
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b flex justify-end">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${group.item.toLowerCase()}...`} className="pl-9" data-testid={`mcc-${group.key}-search`} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid={`mcc-${group.key}-table`}>
              <thead className="border-b">
                <tr className={`text-[11px] uppercase ${group.head}`}>
                  <th className={`${th} text-center w-14`}>S.No</th>
                  <th className={`${th} text-left`}>{group.item}</th>
                  <th className={`${th} text-center`}>Theoretical Quantity</th>
                  <th className={`${th} text-center`}>Purchase Quantity</th>
                  <th className={`${th} text-center`}>Difference %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{data.items.length ? 'No items found' : 'Nothing planned or purchased yet'}</td></tr>
                ) : rows.map((x, i) => (
                  <tr key={x.name} className="hover:bg-gray-50" data-testid="mcc-item-row">
                    <td className={`${td} text-gray-400`}>{i + 1}</td>
                    <td className="px-2 py-2 font-medium text-gray-800 min-w-[140px]">{x.name}</td>
                    <td className={td}>{withUnit(x.theoretical, x.unit)}</td>
                    <td className={td}>
                      {x.purchase > 0 ? withUnit(x.purchase, x.actual_unit || x.unit) : '—'}
                      {x.awaiting > 0 && (
                        <span className="block text-[10px] text-amber-700" title="Received on site, Purchasing has not verified it yet">
                          +{withUnit(x.awaiting, x.actual_unit || x.unit)} to verify
                        </span>
                      )}
                    </td>
                    <td className={td}><DiffCell item={x} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectPage({ row, onBack, onOpenProject, children }) {
  const top = useRef(null);
  // The list may be scrolled far down when a project is clicked.
  useEffect(() => { top.current?.scrollIntoView({ block: 'center' }); }, []);
  return (
    <div className="space-y-4" data-testid="mcc-project-page">
      <div ref={top} className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="mcc-back"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <h2 className="text-lg font-semibold">{row.project_name || '-'}</h2>
          <span className="text-sm text-gray-500">Direct Expenses {children}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenProject} data-testid="mcc-open-project"><ExternalLink className="h-4 w-4 mr-1" />Open project</Button>
      </div>
      <Tabs defaultValue="material">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          {GROUPS.map((g) => <TabsTrigger key={g.key} value={g.key} data-testid={`mcc-tab-${g.key}`}>{g.tab}</TabsTrigger>)}
        </TabsList>
        {GROUPS.map((g) => (
          <TabsContent key={g.key} value={g.key} className="mt-4"><ItemsTable group={g} data={row[g.key]} /></TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function MaterialCCTab({ allowedProjectIds = null, Amount }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // project whose page is open

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
  const money = (v, cls) => (
    Amount ? <Amount value={Math.round(v)} className={cls} /> : <span className={cls}>{money0.format(Math.round(v))}</span>
  );

  const openRow = openId && rows.find((r) => r.project_id === openId);
  if (openRow) {
    return (
      <ProjectPage key={openId} row={openRow} onBack={() => setOpenId(null)} onOpenProject={() => navigate(`/projects/${openId}`)}>
        {money(openRow.direct, 'text-red-600 font-semibold')}
      </ProjectPage>
    );
  }

  return (
    <div className="space-y-4" data-testid="material-cc-tab">
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            Theoretical is entered by Planning on the project&apos;s Materials tab. Click a project to see each item in its own unit.
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
                  <th rowSpan={2} className={`${th} text-center align-bottom w-12`}>S.No</th>
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
                ) : rows.map((r, i) => (
                  <tr key={r.project_id || i} className="hover:bg-gray-50">
                    <td className={`${td} text-gray-400`}>{i + 1}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => r.project_id && setOpenId(r.project_id)}
                        className="text-blue-700 hover:underline text-left font-medium"
                        data-testid="mcc-project"
                      >
                        {r.project_name || '-'}
                      </button>
                    </td>
                    <td className={`${td} font-semibold`} data-testid="mcc-direct">{money(r.direct, 'text-red-600')}</td>
                    {GROUPS.map((g) => {
                      const s = r[g.key];
                      return (
                        <Fragment key={g.key}>
                          <td className={`${td} border-l text-gray-500 ${g.cell} ${g.line}`}>{itemCount(plannedCount(s))}</td>
                          <td className={`${td} text-gray-500 ${g.cell}`}>{itemCount(boughtCount(s))}</td>
                          <td className={`${td} font-bold ${g.cell}`} title={s.compared ? `Weighted by rate over ${s.compared} of ${s.count} items` : undefined}>
                            {s.diff_pct != null ? <span className={diffCls(s.diff_pct)}>{diffText(s.diff_pct)}</span> : '—'}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot className="border-t font-semibold">
                  <tr className="bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap" colSpan={2}>Total ({rows.length})</td>
                    <td className={td}>{money(total, 'text-red-600')}</td>
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
