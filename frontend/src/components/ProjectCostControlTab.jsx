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
  const [split, setSplit] = useState({ direct_pct: 85, indirect_pct: 15 });
  const [dialog, setDialog] = useState(null); // { direct, indirect, busy }

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

  const rows = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const q = norm(search);
    return projects
      .filter((p) => !allowedProjectIds || allowedProjectIds.has(p.project_id))
      .filter((p) => !q || norm(p.project_name).includes(q))
      .map((p) => {
        const area = areaOf(p);
        const gt = Number(p.grand_total || 0);
        const dIn = gt * dPct / 100;
        const iIn = gt * iPct / 100;
        const dOut = Number(p.direct_expense || 0);
        const iOut = Number(p.indirect_expense || 0);
        return {
          ...p, area, gt, rate: area ? gt / area : null,
          dIn, dOut, dBal: dIn - dOut, iIn, iOut, iBal: iIn - iOut,
          net: (dIn - dOut) + (iIn - iOut),
        };
      });
  }, [projects, search, allowedProjectIds, dPct, iPct]);

  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const withArea = rows.filter((r) => r.area);
  const totalArea = withArea.reduce((s, r) => s + r.area, 0);
  const avgRate = totalArea ? withArea.reduce((s, r) => s + r.gt, 0) / totalArea : null;

  const Money = ({ v, cls = '' }) => (
    Amount ? <Amount value={Math.round(v * 100) / 100} className={cls} /> : <span className={cls}>{money2.format(v)}</span>
  );
  const balCls = (v) => (v < 0 ? 'text-red-600' : 'text-emerald-700');

  const openSplit = () => setDialog({ direct: String(dPct), indirect: String(iPct), busy: false });
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

  const saveSplit = async () => {
    setDialog((d) => ({ ...d, busy: true }));
    try {
      const r = await axios.patch(`${API}/accountant/project-cost-control/split`, { direct_pct: dlgD, indirect_pct: dlgI });
      setSplit(r.data);
      setDialog(null);
      toast.success(`Split saved: ${pctFmt(r.data.direct_pct)}% / ${pctFmt(r.data.indirect_pct)}%`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save the split');
      setDialog((d) => d && ({ ...d, busy: false }));
    }
  };

  const th = 'px-3 py-2 font-medium whitespace-nowrap';
  const td = 'px-3 py-2 text-right whitespace-nowrap';

  return (
    <div className="space-y-4" data-testid="project-cost-control-tab">
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={openSplit} className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50" data-testid="pcc-split-btn">
              <Percent className="h-4 w-4" />Split Percentage
            </Button>
            <span className="text-sm text-gray-600">
              Direct <b className="text-gray-900">{pctFmt(dPct)}%</b> · Indirect <b className="text-gray-900">{pctFmt(iPct)}%</b> of Grand Total
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
            <table className="w-full text-sm" data-testid="pcc-table">
              <thead className="bg-gray-50 border-b">
                <tr className="text-xs uppercase text-gray-500">
                  <th className={`${th} text-left`}>S.No</th>
                  <th className={`${th} text-left`}>Project</th>
                  <th className={`${th} text-right`}>Grand Total</th>
                  <th className={`${th} text-right`}>Build Up Area (SQ.FT)</th>
                  <th className={`${th} text-right`}>Per SQ.FT</th>
                  <th className={`${th} text-center`}>Split</th>
                  <th className={`${th} text-right bg-emerald-50/60`}>Direct In</th>
                  <th className={`${th} text-right bg-emerald-50/60`}>Direct Out</th>
                  <th className={`${th} text-right bg-emerald-50/60`}>Direct Bal</th>
                  <th className={`${th} text-right bg-violet-50/60`}>Indirect In</th>
                  <th className={`${th} text-right bg-violet-50/60`}>Indirect Out</th>
                  <th className={`${th} text-right bg-violet-50/60`}>Indirect Bal</th>
                  <th className={`${th} text-right`}>Net</th>
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
                    <tr key={r.project_id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button type="button" onClick={open} className="text-blue-700 hover:underline text-left font-medium">{r.project_name || '-'}</button>
                      </td>
                      <td className={`${td} font-semibold`}><Money v={r.gt} cls="text-violet-700" /></td>
                      <td className={td}>
                        {r.area ? areaFmt.format(r.area) : (
                          <button type="button" onClick={open} className="text-xs text-amber-600 hover:underline">Set area</button>
                        )}
                      </td>
                      <td className={`${td} font-bold text-emerald-700`} data-testid="pcc-rate">{r.rate != null ? money2.format(r.rate) : '—'}</td>
                      <td className="px-3 py-2 text-center text-xs text-gray-600 whitespace-nowrap">{pctFmt(dPct)} / {pctFmt(iPct)}</td>
                      <td className={`${td} bg-emerald-50/30`}><Money v={r.dIn} /></td>
                      <td className={`${td} bg-emerald-50/30`}><Money v={r.dOut} cls="text-red-600" /></td>
                      <td className={`${td} bg-emerald-50/30 font-semibold`}><Money v={r.dBal} cls={balCls(r.dBal)} /></td>
                      <td className={`${td} bg-violet-50/30`}><Money v={r.iIn} /></td>
                      <td className={`${td} bg-violet-50/30`}><Money v={r.iOut} cls="text-red-600" /></td>
                      <td className={`${td} bg-violet-50/30 font-semibold`}><Money v={r.iBal} cls={balCls(r.iBal)} /></td>
                      <td className={`${td} font-bold`} data-testid="pcc-net"><Money v={r.net} cls={balCls(r.net)} /></td>
                    </tr>
                  );
                })}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold">
                  <tr>
                    <td className="px-3 py-2 whitespace-nowrap" colSpan={2}>Total ({rows.length} projects)</td>
                    <td className={td}><Money v={sum('gt')} cls="text-violet-700" /></td>
                    <td className={td}>{totalArea ? areaFmt.format(totalArea) : '—'}</td>
                    <td className={`${td} text-emerald-700`} title="Average over projects that have a Build Up Area">{avgRate != null ? money2.format(avgRate) : '—'}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-600">{pctFmt(dPct)} / {pctFmt(iPct)}</td>
                    <td className={td}><Money v={sum('dIn')} /></td>
                    <td className={td}><Money v={sum('dOut')} cls="text-red-600" /></td>
                    <td className={td}><Money v={sum('dBal')} cls={balCls(sum('dBal'))} /></td>
                    <td className={td}><Money v={sum('iIn')} /></td>
                    <td className={td}><Money v={sum('iOut')} cls="text-red-600" /></td>
                    <td className={td}><Money v={sum('iBal')} cls={balCls(sum('iBal'))} /></td>
                    <td className={td}><Money v={sum('net')} cls={balCls(sum('net'))} /></td>
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
            <DialogTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-violet-600" />Split Percentage</DialogTitle>
            <DialogDescription>
              How each project's Grand Total is split into a Direct and an Indirect budget on this page.
              This is separate from the Cashflow Engine split.
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
              {split.updated_at && (
                <p className="text-[11px] text-gray-500">
                  Last changed {new Date(split.updated_at).toLocaleString('en-IN')}{split.updated_by_name ? ` by ${split.updated_by_name}` : ''}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
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
