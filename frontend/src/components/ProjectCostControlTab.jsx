import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, Percent, Save } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Nov 23 2026 — Accounts → Project Wise → Project Cost Control.
// Per project, all-time:
//   Grand Total  = Scope + client-approved Additions − Deductions (Overview figure)
//   Per SQ.FT    = Grand Total ÷ Build Up Area   (Mrs Lavanya: 1,35,26,353.5 ÷ 4762 = ₹2,840.48)
//   Direct In    = Grand Total × Direct %   — a budget, not money received
//   Indirect In  = Grand Total × Indirect %
//   Direct / Indirect Out = the project's expenses by the Cashbook Cashflow rule
//   Bal = In − Out;  Net = Direct Bal + Indirect Bal
// The split is this tab's own setting (Split Percentage), separate from the
// Cashflow Engine's.

const money2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const areaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const pctFmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const areaOf = (p) => {
  const a = Number(p.buildup_area);
  return Number.isFinite(a) && a > 0 ? a : null;
};

export default function ProjectCostControlTab({ allowedProjectIds = null, Amount }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  // { direct_pct, indirect_pct, projects: { [project_id]: { direct_pct, indirect_pct } } }
  const [split, setSplit] = useState({ direct_pct: 85, indirect_pct: 15, projects: {} });
  // { project: null | row, direct, indirect, resetProjects, busy } — project null = all projects
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // All-time on purpose: the Overview's date range must not change a budget.
    Promise.all([
      axios.get(`${API}/accountant/cashbook-filtered`),
      axios.get(`${API}/accountant/project-cost-control/split`).catch(() => ({ data: null })),
    ]).then(([cb, sp]) => {
      if (cancelled) return;
      setProjects(cb.data?.project_wise || []);
      if (sp.data) setSplit(sp.data);
    }).catch(() => {
      if (!cancelled) toast.error('Could not load project figures');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const dPct = Number(split.direct_pct) || 0;
  const iPct = Number(split.indirect_pct) || 0;
  const projectSplits = split.projects || {};
  const customCount = Object.keys(projectSplits).length;
  // A project's own split wins over the all-projects split.
  const splitFor = (pid) => {
    const own = projectSplits[pid];
    return own
      ? { d: Number(own.direct_pct) || 0, i: Number(own.indirect_pct) || 0, own: true }
      : { d: dPct, i: iPct, own: false };
  };

  const rows = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const q = norm(search);
    return projects
      .filter((p) => !allowedProjectIds || allowedProjectIds.has(p.project_id))
      .filter((p) => !q || norm(p.project_name).includes(q))
      .map((p) => {
        const area = areaOf(p);
        const gt = Number(p.grand_total || 0);
        const sp = splitFor(p.project_id);
        const dIn = gt * sp.d / 100;
        const iIn = gt * sp.i / 100;
        const dOut = Number(p.direct_expense || 0);
        const iOut = Number(p.indirect_expense || 0);
        return {
          ...p, area, gt, rate: area ? gt / area : null, sp,
          dIn, dOut, dBal: dIn - dOut, iIn, iOut, iBal: iIn - iOut,
          net: (dIn - dOut) + (iIn - iOut),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, allowedProjectIds, dPct, iPct, projectSplits]);

  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const withArea = rows.filter((r) => r.area);
  const totalArea = withArea.reduce((s, r) => s + r.area, 0);
  const avgRate = totalArea ? withArea.reduce((s, r) => s + r.gt, 0) / totalArea : null;

  // In / Out / Bal / Net are budgets, shown in whole rupees so the 13
  // columns fit; Grand Total keeps paise (`exact`).
  const Money = ({ v, cls = '', exact = false }) => {
    const val = exact ? Math.round(v * 100) / 100 : Math.round(v);
    return Amount ? <Amount value={val} className={cls} /> : <span className={cls}>{exact ? money2.format(val) : money0.format(val)}</span>;
  };
  const balCls = (v) => (v < 0 ? 'text-red-600' : 'text-emerald-700');

  const openSplit = () => setDialog({ project: null, direct: String(dPct), indirect: String(iPct), resetProjects: false, busy: false });
  const openProjectSplit = (r) => setDialog({ project: r, direct: String(r.sp.d), indirect: String(r.sp.i), busy: false });
  const setDirect = (v) => {
    const n = parseFloat(v);
    setDialog((d) => ({ ...d, direct: v, indirect: Number.isFinite(n) && n >= 0 && n <= 100 ? String(Math.round((100 - n) * 100) / 100) : d.indirect }));
  };
  const setIndirect = (v) => {
    const n = parseFloat(v);
    setDialog((d) => ({ ...d, indirect: v, direct: Number.isFinite(n) && n >= 0 && n <= 100 ? String(Math.round((100 - n) * 100) / 100) : d.direct }));
  };
  const dlgD = parseFloat(dialog?.direct);
  const dlgI = parseFloat(dialog?.indirect);
  const dlgValid = dialog && Number.isFinite(dlgD) && Number.isFinite(dlgI) && dlgD >= 0 && dlgI >= 0 && Math.abs(dlgD + dlgI - 100) <= 0.01;

  const runSplit = async (request, okMsg) => {
    setDialog((d) => ({ ...d, busy: true }));
    try {
      const r = await request();
      setSplit({ projects: {}, ...r.data });
      setDialog(null);
      toast.success(okMsg);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save the split');
      setDialog((d) => d && ({ ...d, busy: false }));
    }
  };
  const saveSplit = () => {
    const body = { direct_pct: dlgD, indirect_pct: dlgI };
    if (dialog.project) {
      const pid = dialog.project.project_id;
      return runSplit(() => axios.put(`${API}/accountant/project-cost-control/split/projects/${pid}`, body),
        `${dialog.project.project_name}: ${pctFmt(dlgD)}% / ${pctFmt(dlgI)}%`);
    }
    return runSplit(() => axios.patch(`${API}/accountant/project-cost-control/split`, { ...body, reset_projects: !!dialog.resetProjects }),
      `All projects: ${pctFmt(dlgD)}% / ${pctFmt(dlgI)}%`);
  };
  const clearProjectSplit = () => {
    const pid = dialog.project.project_id;
    return runSplit(() => axios.delete(`${API}/accountant/project-cost-control/split/projects/${pid}`),
      `${dialog.project.project_name} uses the all-projects split again`);
  };

  const th = 'px-2 py-1.5 font-medium';
  const td = 'px-2 py-2 text-right whitespace-nowrap';
  // S.No + Project stay put while the money columns scroll on narrow screens.
  const stickyNo = 'sticky left-0 z-10 bg-inherit';
  const stickyProj = 'sticky left-8 z-10 bg-inherit';

  return (
    <div className="space-y-4" data-testid="project-cost-control-tab">
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={openSplit} className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50" data-testid="pcc-split-btn">
              <Percent className="h-4 w-4" />Split Percentage
            </Button>
            <span className="text-sm text-gray-600">
              All projects: Direct <b className="text-gray-900">{pctFmt(dPct)}%</b> · Indirect <b className="text-gray-900">{pctFmt(iPct)}%</b> of Grand Total
              {customCount > 0 && <span className="ml-2 text-violet-700">· {customCount} project{customCount > 1 ? 's' : ''} with own split</span>}
            </span>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project name..." className="pl-9" data-testid="pcc-search" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="pcc-table">
              <thead className="bg-gray-50 border-b">
                <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th rowSpan={2} className={`${th} ${stickyNo} w-8 text-left align-bottom`}>S.No</th>
                  <th rowSpan={2} className={`${th} ${stickyProj} text-left align-bottom`}>Project</th>
                  <th rowSpan={2} className={`${th} text-right align-bottom`}>Grand<br />Total</th>
                  <th rowSpan={2} className={`${th} text-right align-bottom`}>Build Up Area<br />(SQ.FT)</th>
                  <th rowSpan={2} className={`${th} text-right align-bottom`}>Per<br />SQ.FT</th>
                  <th rowSpan={2} className={`${th} text-center align-bottom`}>Split</th>
                  <th colSpan={3} className={`${th} text-center bg-emerald-50 text-emerald-700 border-l border-emerald-100`}>Direct</th>
                  <th colSpan={3} className={`${th} text-center bg-violet-50 text-violet-700 border-l border-violet-100`}>Indirect</th>
                  <th rowSpan={2} className={`${th} text-right align-bottom border-l`}>Net</th>
                </tr>
                <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th className={`${th} text-right bg-emerald-50/60 border-l border-emerald-100`}>In</th>
                  <th className={`${th} text-right bg-emerald-50/60`}>Out</th>
                  <th className={`${th} text-right bg-emerald-50/60`}>Bal</th>
                  <th className={`${th} text-right bg-violet-50/60 border-l border-violet-100`}>In</th>
                  <th className={`${th} text-right bg-violet-50/60`}>Out</th>
                  <th className={`${th} text-right bg-violet-50/60`}>Bal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">No projects found</td></tr>
                ) : rows.map((r, i) => {
                  const open = () => r.project_id && navigate(`/projects/${r.project_id}`);
                  return (
                    <tr key={r.project_id || i} className="bg-white hover:bg-gray-50">
                      <td className={`px-2 py-2 text-gray-400 ${stickyNo}`}>{i + 1}</td>
                      <td className={`px-2 py-2 whitespace-nowrap ${stickyProj}`}>
                        <button type="button" onClick={open} className="text-blue-700 hover:underline text-left font-medium">{r.project_name || '-'}</button>
                      </td>
                      <td className={`${td} font-semibold`}><Money v={r.gt} cls="text-violet-700" exact /></td>
                      <td className={td}>
                        {r.area ? areaFmt.format(r.area) : (
                          <button type="button" onClick={open} className="text-xs text-amber-600 hover:underline">Set area</button>
                        )}
                      </td>
                      <td className={`${td} font-bold text-emerald-700`} data-testid="pcc-rate">{r.rate != null ? money2.format(r.rate) : '—'}</td>
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openProjectSplit(r)}
                          title={r.sp.own ? 'This project has its own split. Click to change.' : 'Uses the all-projects split. Click to set this project\'s own split.'}
                          className={`px-1.5 py-0.5 rounded border text-[11px] hover:border-violet-400 ${r.sp.own ? 'bg-violet-100 border-violet-300 text-violet-800 font-semibold' : 'border-dashed border-gray-300 text-gray-600'}`}
                          data-testid="pcc-row-split"
                        >
                          {pctFmt(r.sp.d)} / {pctFmt(r.sp.i)}
                        </button>
                      </td>
                      <td className={`${td} bg-emerald-50/30 border-l border-emerald-100`}><Money v={r.dIn} /></td>
                      <td className={`${td} bg-emerald-50/30`}><Money v={r.dOut} cls="text-red-600" /></td>
                      <td className={`${td} bg-emerald-50/30 font-semibold`}><Money v={r.dBal} cls={balCls(r.dBal)} /></td>
                      <td className={`${td} bg-violet-50/30 border-l border-violet-100`}><Money v={r.iIn} /></td>
                      <td className={`${td} bg-violet-50/30`}><Money v={r.iOut} cls="text-red-600" /></td>
                      <td className={`${td} bg-violet-50/30 font-semibold`}><Money v={r.iBal} cls={balCls(r.iBal)} /></td>
                      <td className={`${td} font-bold border-l`} data-testid="pcc-net"><Money v={r.net} cls={balCls(r.net)} /></td>
                    </tr>
                  );
                })}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot className="border-t font-semibold">
                  <tr className="bg-gray-50">
                    <td className={`px-2 py-2 whitespace-nowrap ${stickyNo}`} colSpan={2}>Total ({rows.length})</td>
                    <td className={td}><Money v={sum('gt')} cls="text-violet-700" exact /></td>
                    <td className={td}>{totalArea ? areaFmt.format(totalArea) : '—'}</td>
                    <td className={`${td} text-emerald-700`} title="Average over projects that have a Build Up Area">{avgRate != null ? money2.format(avgRate) : '—'}</td>
                    <td className="px-2 py-2 text-center text-gray-400">—</td>
                    <td className={`${td} border-l border-emerald-100`}><Money v={sum('dIn')} /></td>
                    <td className={td}><Money v={sum('dOut')} cls="text-red-600" /></td>
                    <td className={td}><Money v={sum('dBal')} cls={balCls(sum('dBal'))} /></td>
                    <td className={`${td} border-l border-violet-100`}><Money v={sum('iIn')} /></td>
                    <td className={td}><Money v={sum('iOut')} cls="text-red-600" /></td>
                    <td className={td}><Money v={sum('iBal')} cls={balCls(sum('iBal'))} /></td>
                    <td className={`${td} border-l`}><Money v={sum('net')} cls={balCls(sum('net'))} /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md" data-testid="pcc-split-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-violet-600" />
              {dialog?.project ? `Split — ${dialog.project.project_name}` : 'Split Percentage — All Projects'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.project
                ? `This project's own Direct / Indirect split of its Grand Total. All projects use ${pctFmt(dPct)} / ${pctFmt(iPct)}.`
                : "How every project's Grand Total is split into a Direct and an Indirect budget, unless the project has its own split."}
              {' '}Separate from the Cashflow Engine split.
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pcc-direct">Direct %</Label>
                  <Input id="pcc-direct" type="number" min="0" max="100" step="any" value={dialog.direct} onChange={(e) => setDirect(e.target.value)} data-testid="pcc-direct-input" />
                </div>
                <div>
                  <Label htmlFor="pcc-indirect">Indirect %</Label>
                  <Input id="pcc-indirect" type="number" min="0" max="100" step="any" value={dialog.indirect} onChange={(e) => setIndirect(e.target.value)} data-testid="pcc-indirect-input" />
                </div>
              </div>
              {!dlgValid && <p className="text-xs text-red-600">Direct % + Indirect % must add up to 100.</p>}
              {!dialog.project && customCount > 0 && (
                <label className="flex items-start gap-2 text-xs text-gray-700 bg-violet-50 border border-violet-200 rounded p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!dialog.resetProjects}
                    onChange={(e) => setDialog((d) => ({ ...d, resetProjects: e.target.checked }))}
                    data-testid="pcc-reset-projects"
                  />
                  <span>Also apply to the {customCount} project{customCount > 1 ? 's' : ''} that {customCount > 1 ? 'have' : 'has'} their own split (removes their own split).</span>
                </label>
              )}
              {(() => {
                const meta = dialog.project ? projectSplits[dialog.project.project_id] : split;
                return meta?.updated_at ? (
                  <p className="text-[11px] text-gray-500">
                    Last changed {new Date(meta.updated_at).toLocaleString('en-IN')}{meta.updated_by_name ? ` by ${meta.updated_by_name}` : ''}
                  </p>
                ) : null;
              })()}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {dialog?.project?.sp?.own && (
              <Button variant="outline" onClick={clearProjectSplit} disabled={dialog?.busy} className="sm:mr-auto border-amber-300 text-amber-700 hover:bg-amber-50" data-testid="pcc-clear-project-split">
                Use all-projects split
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={saveSplit} disabled={!dlgValid || dialog?.busy} className="bg-violet-600 hover:bg-violet-700" data-testid="pcc-split-save">
              <Save className="h-4 w-4 mr-1" />Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
