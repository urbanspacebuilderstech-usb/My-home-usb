import { useState, useEffect } from 'react';
import axios from 'axios';
import { TrendingUp, TrendingDown, Wallet, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => {
  if (!n && n !== 0) return '₹0';
  const num = Number(n);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export default function ProjectFinance() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, pfRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/project-finance`).catch(() => ({ data: { projects: [] } })),
        axios.get(`${API}/notifications`).catch(() => ({ data: [] })),
      ]);
      setUser(userRes.data);
      setData(pfRes.data.projects || []);
      setUnreadNotifs((notifsRes.data || []).filter(n => !n.read).length);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return null;

  const totalIncome = data.reduce((s, p) => s + p.income, 0);
  const totalExpense = data.reduce((s, p) => s + p.expenses.total, 0);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="project-finance-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1" data-testid="pf-title">Project Finance</h2>
        <p className="text-sm text-gray-500 mb-5">Project-wise income and expense breakdown</p>

        {/* Summary Row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Card className="border-l-4 border-l-green-500"><CardContent className="p-3 sm:p-4">
            <p className="text-xs text-gray-500">Total Income</p>
            <p className="text-lg font-extrabold text-green-700">{fmt(totalIncome)}</p>
          </CardContent></Card>
          <Card className="border-l-4 border-l-red-500"><CardContent className="p-3 sm:p-4">
            <p className="text-xs text-gray-500">Total Expense</p>
            <p className="text-lg font-extrabold text-red-700">{fmt(totalExpense)}</p>
          </CardContent></Card>
          <Card className="border-l-4 border-l-amber-500"><CardContent className="p-3 sm:p-4">
            <p className="text-xs text-gray-500">Net Profit</p>
            <p className={`text-lg font-extrabold ${totalIncome - totalExpense >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(totalIncome - totalExpense)}</p>
          </CardContent></Card>
        </div>

        {/* Project Table */}
        <Card>
          <CardHeader className="border-b py-3 px-4"><CardTitle className="text-sm font-bold">All Projects ({data.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile Cards */}
            <div className="block sm:hidden divide-y">
              {data.map((p) => (
                <div key={p.project_id} className="p-4 cursor-pointer active:bg-gray-50" onClick={() => window.location.href = `/projects/${p.project_id}`} data-testid={`pf-mobile-${p.project_id}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div><p className="font-semibold text-sm">{p.name}</p><p className="text-xs text-gray-400">{p.client_name}</p></div>
                    <Badge variant={p.status === 'active' || p.status === 'in_progress' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div><p className="text-[10px] text-gray-400">Income</p><p className="text-xs font-bold text-green-600">{fmt(p.income)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Material</p><p className="text-xs font-bold text-amber-600">{fmt(p.expenses.material)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Labour</p><p className="text-xs font-bold text-blue-600">{fmt(p.expenses.labour)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Profit</p><p className={`text-xs font-bold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(p.profit)}</p></div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Project Value</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Income</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Material</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Labour</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Vendor</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Other</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Total Exp</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Profit</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.map((p, i) => (
                    <tr key={p.project_id} className="hover:bg-gray-50/50" data-testid={`pf-row-${p.project_id}`}>
                      <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3"><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-400">{p.client_name}</p></td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(p.total_value)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{fmt(p.income)}</td>
                      <td className="px-4 py-3 text-right text-sm text-amber-600">{fmt(p.expenses.material)}</td>
                      <td className="px-4 py-3 text-right text-sm text-blue-600">{fmt(p.expenses.labour)}</td>
                      <td className="px-4 py-3 text-right text-sm text-purple-600">{fmt(p.expenses.vendor)}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500">{fmt(p.expenses.petty_cash + p.expenses.other)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(p.expenses.total)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: p.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(p.profit)}</td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => window.location.href = `/projects/${p.project_id}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
