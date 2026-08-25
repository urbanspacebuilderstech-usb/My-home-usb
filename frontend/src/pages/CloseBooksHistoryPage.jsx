/**
 * Close Books — History (full page).
 *
 * Every day the Accountant has closed books, grouped by date, with per-mode
 * (Cash / HDFC Current / HDFC Savings / Cheque / Cash DT) computed vs actual
 * vs variance. Backed by GET /api/accountant/daily-closing/history.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronUp, Loader2, CalendarDays, ArrowLeft, Download, FileSpreadsheet } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODE_LABELS = {
  cash: 'Cash',
  current_account: 'HDFC Current',
  savings_account: 'HDFC Savings',
  cheque: 'Cheque',
  direct_transfer: 'Cash DT',
};
const MODE_ORDER = ['cash', 'current_account', 'savings_account', 'cheque', 'direct_transfer'];
const ALLOWED_ROLES = ['accountant', 'super_admin'];

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const currentMonth = () => new Date().toISOString().slice(0, 7);

// Closing dates are stored as plain YYYY-MM-DD in local terms, so derive the
// range the same way rather than via toISOString(), which would shift the day
// backwards for IST once it is past midnight UTC.
const isoDay = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
};

export default function CloseBooksHistoryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(daysAgo(30));
  const [customTo, setCustomTo] = useState(isoDay(new Date()));

  useEffect(() => {
    axios.get(`${API}/auth/me`, { withCredentials: true })
      .then(res => {
        if (!ALLOWED_ROLES.includes(res.data?.role)) {
          window.location.href = '/dashboard';
          return;
        }
        setUser(res.data);
        setAuthChecked(true);
      })
      .catch(() => { window.location.href = '/login'; });
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/accountant/daily-closing/history`, { params: { month } });
      setDays(Array.isArray(r.data?.days) ? r.data.days : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load closing history');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { if (authChecked) fetchHistory(); }, [authChecked, fetchHistory]);

  // The export is driven by an explicit date range rather than whatever month
  // is on screen, so a download can span months without changing the view.
  const downloadXlsx = useCallback(async (from, to, label) => {
    if (from && to && from > to) {
      toast.error('From date cannot be after To date');
      return;
    }
    setDownloading(true);
    try {
      const res = await axios.get(`${API}/accountant/daily-closing/history/export`, {
        params: { start_date: from, end_date: to },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = from === to ? `close-books-${from}.xlsx` : `close-books-${from}-to-${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${label}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to download Excel');
    } finally {
      setDownloading(false);
    }
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/accounts-board')} data-testid="close-books-history-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-amber-600" /> Close Books — History
            </h1>
            <p className="text-sm text-gray-500">Every day the books were closed, with actual vs computed balance per payment mode.</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 w-44 text-sm"
                data-testid="close-books-history-month"
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    disabled={downloading}
                    data-testid="close-books-download-btn"
                  >
                    {downloading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileSpreadsheet className="h-4 w-4" />}
                    Download Excel
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-gray-500">Choose a period</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-sm gap-2"
                    onSelect={() => downloadXlsx(isoDay(new Date()), isoDay(new Date()), 'today')}
                    data-testid="close-books-download-today"
                  >
                    <Download className="h-3.5 w-3.5 text-gray-400" /> Today
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-sm gap-2"
                    onSelect={() => downloadXlsx(daysAgo(6), isoDay(new Date()), 'last 7 days')}
                    data-testid="close-books-download-7d"
                  >
                    <Download className="h-3.5 w-3.5 text-gray-400" /> Last 7 Days
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-sm gap-2"
                    onSelect={() => setCustomOpen(true)}
                    data-testid="close-books-download-custom"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-gray-400" /> Custom Range...
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-amber-600" /></div>
            ) : days.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-400" data-testid="close-books-history-empty">No closings recorded for this month</div>
            ) : (
              <div className="space-y-2">
                {days.map(d => {
                  const isOpen = expanded === d.date;
                  const varColor = d.total_variance === 0 ? 'text-emerald-700' : d.total_variance > 0 ? 'text-blue-700' : 'text-red-700';
                  return (
                    <div key={d.date} className="border rounded-lg overflow-hidden" data-testid={`close-books-day-${d.date}`}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : d.date)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        data-testid={`close-books-day-toggle-${d.date}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                          <span className="font-semibold text-sm">{d.date}</span>
                          <span className="text-xs text-gray-500 truncate">Closed by {d.closed_by_name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs shrink-0">
                          <span className="text-gray-500">Actual: <strong className="text-gray-800">{fmtInr(d.total_actual)}</strong></span>
                          <span className={`font-semibold ${varColor}`}>
                            {d.total_variance === 0 ? 'Matched' : `${d.total_variance > 0 ? 'Surplus' : 'Shortfall'} ${fmtInr(Math.abs(d.total_variance))}`}
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="p-3 border-t overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-400 uppercase text-[10px]">
                                <th className="pb-1.5 pr-3">Mode</th>
                                <th className="pb-1.5 pr-3 text-right">Computed</th>
                                <th className="pb-1.5 pr-3 text-right">Actual</th>
                                <th className="pb-1.5 pr-3 text-right">Variance</th>
                                <th className="pb-1.5 pr-3">Remark</th>
                                <th className="pb-1.5">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {MODE_ORDER.filter(m => d.modes[m]).map(m => {
                                const row = d.modes[m];
                                const v = Number(row.variance || 0);
                                return (
                                  <tr key={m} data-testid={`close-books-row-${d.date}-${m}`}>
                                    <td className="py-1.5 pr-3 font-medium">{MODE_LABELS[m] || m}</td>
                                    <td className="py-1.5 pr-3 text-right">{fmtInr(row.computed_balance)}</td>
                                    <td className="py-1.5 pr-3 text-right">{fmtInr(row.actual_balance)}</td>
                                    <td className={`py-1.5 pr-3 text-right font-semibold ${v === 0 ? 'text-emerald-700' : v > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                      {v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtInr(v)}`}
                                    </td>
                                    <td className="py-1.5 pr-3 text-gray-500 italic max-w-[220px] truncate" title={row.remark}>{row.remark || '-'}</td>
                                    <td className="py-1.5">
                                      {row.reopened ? (
                                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Re-opened</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Closed</Badge>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm" data-testid="close-books-custom-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Download Custom Range
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 text-sm mt-1"
                data-testid="close-books-custom-from"
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 text-sm mt-1"
                data-testid="close-books-custom-to"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500">Both dates are included. The file has a Summary sheet (one row per day) and a Detail sheet (one row per payment mode).</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              disabled={downloading || !customFrom || !customTo}
              onClick={async () => {
                await downloadXlsx(customFrom, customTo, `${customFrom} to ${customTo}`);
                setCustomOpen(false);
              }}
              data-testid="close-books-custom-download"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
