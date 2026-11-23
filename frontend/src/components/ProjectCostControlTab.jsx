import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';

// Nov 23 2026 — Accounts → Project Wise → Project Cost Control.
// Per project: Grand Total (Scope + client-approved Additions − Deductions,
// the same figure as the Overview table) ÷ Build Up Area = rate per SQ.FT.
// e.g. Mrs Lavanya: ₹1,35,26,353.5 ÷ 4762 SQ.FT = ₹2,840.48.
// Build Up Area is set on the project page header.

const rateFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const areaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const areaOf = (p) => {
  const a = Number(p.buildup_area);
  return Number.isFinite(a) && a > 0 ? a : null;
};

export default function ProjectCostControlTab({ projects = [], loading = false, Amount }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const q = norm(search);
    return projects
      .filter((p) => !q || norm(p.project_name).includes(q))
      .map((p) => {
        const area = areaOf(p);
        const gt = Number(p.grand_total || 0);
        return { ...p, area, gt, rate: area ? gt / area : null };
      });
  }, [projects, search]);

  const withArea = rows.filter((r) => r.area);
  const totalGt = rows.reduce((s, r) => s + r.gt, 0);
  const totalArea = withArea.reduce((s, r) => s + r.area, 0);
  const avgRate = totalArea ? withArea.reduce((s, r) => s + r.gt, 0) / totalArea : null;

  return (
    <div className="space-y-4" data-testid="project-cost-control-tab">
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            Rate per SQ.FT = Grand Total ÷ Build Up Area. Click a project to set its Build Up Area.
          </p>
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
                  <th className="text-left px-3 py-2 font-medium">S.No</th>
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-right px-3 py-2 font-medium">Grand Total</th>
                  <th className="text-right px-3 py-2 font-medium">Build Up Area (SQ.FT)</th>
                  <th className="text-right px-3 py-2 font-medium">Per SQ.FT</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No projects found</td></tr>
                ) : rows.map((r, i) => {
                  const open = () => r.project_id && navigate(`/projects/${r.project_id}`);
                  return (
                    <tr key={r.project_id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={open} className="text-blue-700 hover:underline text-left font-medium">{r.project_name || '-'}</button>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-violet-700">
                        {Amount ? <Amount value={r.gt} className="text-violet-700" /> : rateFmt.format(r.gt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.area ? areaFmt.format(r.area) : (
                          <button type="button" onClick={open} className="text-xs text-amber-600 hover:underline">Set area</button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700" data-testid="pcc-rate">
                        {r.rate != null ? rateFmt.format(r.rate) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>Total ({rows.length} projects)</td>
                    <td className="px-3 py-2 text-right text-violet-700">
                      {Amount ? <Amount value={totalGt} className="text-violet-700" /> : rateFmt.format(totalGt)}
                    </td>
                    <td className="px-3 py-2 text-right">{totalArea ? areaFmt.format(totalArea) : '—'}</td>
                    <td className="px-3 py-2 text-right text-emerald-700" title="Average over projects that have a Build Up Area">
                      {avgRate != null ? rateFmt.format(avgRate) : '—'}
                    </td>
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
