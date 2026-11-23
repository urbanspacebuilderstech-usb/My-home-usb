import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Nov 23 2026 — Accounts → Project Wise → Material CC.
// Per project, all-time Direct Expenses: everything the Cashbook's Cashflow
// column marks Direct (material, labour, vendor, petty cash…) plus the
// direct carry-forward — the same figure as Direct Out on Project Cost Control.

const money0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function MaterialCCTab({ allowedProjectIds = null, Amount }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // All-time on purpose, like Project Cost Control.
    axios.get(`${API}/accountant/cashbook-filtered`)
      .then((r) => { if (!cancelled) setProjects(r.data?.project_wise || []); })
      .catch(() => { if (!cancelled) toast.error('Could not load project figures'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const q = norm(search);
    return projects
      .filter((p) => !allowedProjectIds || allowedProjectIds.has(p.project_id))
      .filter((p) => !q || norm(p.project_name).includes(q))
      .map((p) => ({ ...p, direct: Number(p.direct_expense || 0) }));
  }, [projects, search, allowedProjectIds]);

  const total = rows.reduce((s, r) => s + r.direct, 0);
  const Money = ({ v, cls = '' }) => (
    Amount ? <Amount value={Math.round(v)} className={cls} /> : <span className={cls}>{money0.format(Math.round(v))}</span>
  );

  return (
    <div className="space-y-4" data-testid="material-cc-tab">
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            Direct Expenses = material, labour, vendor and other direct spend per project (all time).
          </p>
          <div className="relative w-full sm:w-80">
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
                  <th className="px-2 py-2 font-medium text-center w-12">S.No</th>
                  <th className="px-2 py-2 font-medium text-left">Project</th>
                  <th className="px-2 py-2 font-medium text-center">Direct Expenses</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No projects found</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.project_id || i} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-center text-gray-400">{i + 1}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => r.project_id && navigate(`/projects/${r.project_id}`)}
                        className="text-blue-700 hover:underline text-left font-medium"
                      >
                        {r.project_name || '-'}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center whitespace-nowrap font-semibold" data-testid="mcc-direct">
                      <Money v={r.direct} cls="text-red-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot className="border-t font-semibold">
                  <tr className="bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap" colSpan={2}>Total ({rows.length})</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap"><Money v={total} cls="text-red-600" /></td>
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
