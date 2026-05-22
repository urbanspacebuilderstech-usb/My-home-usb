import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  ArrowRight,
  IndianRupee,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PaymentSchedulePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState({ entries: [], summary: {} });
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const navigate = useNavigate();

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const r = await axios.get(`${API}/auth/me`);
      setUser(r.data);
      fetchSchedule(month, year);
    } catch { window.location.href = '/login'; }
    finally { setLoading(false); }
  };

  const fetchSchedule = async (m, y) => {
    try {
      const r = await axios.get(`${API}/planning/monthly-schedule?month=${m}&year=${y}`);
      setSchedule(r.data || { entries: [], summary: {} });
    } catch { }
  };

  const changeMonth = (dir) => {
    let m = month + dir, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
    fetchSchedule(m, y);
  };

  const formatCurrency = (a) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;

  const entries = schedule.entries || [];
  const sum = schedule.summary || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Month Nav */}
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => changeMonth(-1)} data-testid="prev-month"><ArrowRight className="h-4 w-4 rotate-180" /></Button>
                <div className="text-center min-w-[160px]">
                  <p className="text-lg font-bold text-gray-900 flex items-center justify-center gap-2" data-testid="current-month">
                    <Calendar className="h-5 w-5 text-amber-600" /> {MONTH_NAMES[month]} {year}
                  </p>
                  <p className="text-xs text-gray-500">Monthly Payment Schedule</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => changeMonth(1)} data-testid="next-month"><ArrowRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Total Planned', value: formatCurrency(sum.total_planned), sub: `${sum.total_entries || 0} stages`, color: 'indigo' },
            { label: 'Collected', value: formatCurrency(sum.total_received), sub: `${sum.collected_count || 0} collected`, color: 'green' },
            { label: 'Balance', value: formatCurrency(sum.total_balance), sub: '', color: 'amber' },
            { label: 'Carry Over', value: sum.carryover_count || 0, sub: 'from prev months', color: 'red' },
            { label: 'Requested', value: sum.requested_count || 0, sub: 'sent to CRE', color: 'blue' },
          ].map(c => (
            <Card key={c.label} className={`border-l-4 border-l-${c.color}-500`}>
              <CardContent className="p-3">
                <p className="text-[10px] text-gray-500 uppercase font-medium">{c.label}</p>
                <p className={`text-lg font-bold text-${c.color}-700`}>{c.value}</p>
                {c.sub && <p className="text-[10px] text-gray-400">{c.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-green-600" />
              {MONTH_NAMES[month]} {year} — All Payment Entries ({entries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="schedule-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.length === 0 ? (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-400">No entries for {MONTH_NAMES[month]} {year}</td></tr>
                  ) : entries.map(e => {
                    const balance = (e.amount || 0) - (e.amount_received || 0);
                    const scMap = {
                      requested: { label: 'Req. Raised', cls: 'bg-blue-100 text-blue-700' },
                      pending_collection: { label: 'Pending Collection', cls: 'bg-indigo-100 text-indigo-700' },
                      pending: { label: 'Not Collected', cls: 'bg-gray-100 text-gray-700' },
                      partial: { label: 'Partially Collected', cls: 'bg-amber-100 text-amber-700' },
                      paid: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
                      collected: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
                    };
                    const sc = scMap[e.workflow_status] || scMap[e.stage_status] || scMap.pending;
                    return (
                      <tr key={e.entry_id} className="hover:bg-indigo-50/50 cursor-pointer" onClick={() => navigate(`/projects/${e.project_id}`)}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-indigo-700">{e.project_name}</p>
                          <p className="text-[10px] text-gray-400">{e.client_name}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">Stage {e.stage_label}</span>
                          <p className="text-xs text-gray-500">{e.stage_name}</p>
                          {e.is_carryover && (
                            <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] mt-0.5">Due from {MONTH_NAMES[e.carry_from_month]} {e.carry_from_year}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(e.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-green-600 font-medium">{formatCurrency(e.amount_received)}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatCurrency(balance)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>{sc.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {entries.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr className="font-bold text-sm">
                      <td colSpan="2" className="px-4 py-2.5 text-right text-gray-600">Total</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(sum.total_planned)}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{formatCurrency(sum.total_received)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(sum.total_balance)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
