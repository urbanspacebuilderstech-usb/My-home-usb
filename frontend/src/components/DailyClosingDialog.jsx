/**
 * Daily Closing Balance dialog.
 *
 * Renders a 5-input form (Cash · HDFC Current · HDFC Savings · Cheque · Cash DT)
 * pre-filled with the computed book balance the caller passes in. The
 * Accountant edits the actual figures, adds a remark where needed and saves;
 * the API upserts one `daily_closings` row per mode for the chosen date.
 *
 * Props:
 *   open            bool
 *   onClose         fn()
 *   date            'YYYY-MM-DD' — target close date (usually today)
 *   computed        { cash, current_account, savings_account, cheque, direct_transfer }
 *   onSaved         fn() — parent reload trigger
 */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Wallet, Building2, Landmark, FileText, ArrowLeftRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODES = [
  { key: 'cash',              label: 'Cash',         icon: Wallet,          color: 'text-amber-600',   ring: 'focus:ring-amber-400',   dot: 'bg-amber-500'   },
  { key: 'current_account',   label: 'HDFC Current', icon: Building2,       color: 'text-blue-600',    ring: 'focus:ring-blue-400',    dot: 'bg-blue-500'    },
  { key: 'savings_account',   label: 'HDFC Savings', icon: Landmark,        color: 'text-emerald-600', ring: 'focus:ring-emerald-400', dot: 'bg-emerald-500' },
  { key: 'cheque',            label: 'Cheque',       icon: FileText,        color: 'text-violet-600',  ring: 'focus:ring-violet-400',  dot: 'bg-violet-500'  },
  { key: 'direct_transfer',   label: 'Cash DT',      icon: ArrowLeftRight,  color: 'text-rose-600',    ring: 'focus:ring-rose-400',    dot: 'bg-rose-500'    },
];

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function DailyClosingDialog({ open, onClose, date, computed, onSaved }) {
  const [existing, setExisting] = useState({});     // { mode: row } fetched from /daily-closing
  const [actuals, setActuals] = useState({});       // mode -> string (user input)
  const [remarks, setRemarks] = useState({});       // mode -> remark
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load any already-saved rows for `date` so re-opening the dialog shows
  // the previously entered numbers instead of resetting to the computed value.
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${API}/accountant/daily-closing`, { params: { date } });
        const t = r.data?.today || {};
        setExisting(t);
        const nextActuals = {};
        const nextRemarks = {};
        MODES.forEach(m => {
          if (t[m.key]) {
            nextActuals[m.key] = String(t[m.key].actual_balance ?? '');
            nextRemarks[m.key] = t[m.key].remark || '';
          } else {
            nextActuals[m.key] = String(computed?.[m.key] ?? '');
            nextRemarks[m.key] = '';
          }
        });
        setActuals(nextActuals);
        setRemarks(nextRemarks);
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Failed to load closing state');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  const rows = useMemo(() => MODES.map(m => {
    const book = Number(computed?.[m.key] ?? 0);
    const raw = actuals[m.key];
    const actual = raw === '' || raw == null ? NaN : Number(raw);
    const variance = Number.isFinite(actual) ? +(actual - book).toFixed(2) : null;
    return { ...m, book, actual, variance };
  }), [computed, actuals]);

  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.book += r.book;
    if (Number.isFinite(r.actual)) acc.actual += r.actual;
    if (Number.isFinite(r.variance)) acc.variance += r.variance;
    return acc;
  }, { book: 0, actual: 0, variance: 0 }), [rows]);

  const save = async () => {
    // Validate — every mode must have a numeric value.
    const bad = MODES.find(m => {
      const v = actuals[m.key];
      return v === '' || v == null || Number.isNaN(Number(v));
    });
    if (bad) { toast.error(`Enter actual balance for ${bad.label}`); return; }
    // Force a remark whenever variance is non-zero.
    const missingRemark = rows.find(r => r.variance !== 0 && !(remarks[r.key] || '').trim());
    if (missingRemark) { toast.error(`${missingRemark.label} has variance ${fmtInr(missingRemark.variance)} — please add a remark.`); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/accountant/daily-closing`, {
        date,
        entries: rows.map(r => ({
          mode: r.key,
          computed_balance: r.book,
          actual_balance: r.actual,
          remark: remarks[r.key] || '',
        })),
      });
      toast.success(`Closing saved for ${date}`);
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="daily-closing-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <CheckCircle2 className="h-5 w-5" /> Close Books · {date}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter the actual cash / bank / cheque position at end of day. Variances vs the ledger are stored for reconciliation.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-amber-600" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.map(r => {
                const Icon = r.icon;
                const varAbs = Math.abs(r.variance || 0);
                const varDir = r.variance == null ? 'neutral' : r.variance === 0 ? 'match' : r.variance > 0 ? 'surplus' : 'shortfall';
                const varStyle = varDir === 'match' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : varDir === 'surplus' ? 'text-blue-700 bg-blue-50 border-blue-200'
                              : varDir === 'shortfall' ? 'text-red-700 bg-red-50 border-red-200'
                              : 'text-gray-500 bg-gray-50 border-gray-200';
                const varLabel = varDir === 'match' ? 'Matched'
                              : varDir === 'surplus' ? `Surplus ${fmtInr(varAbs)}`
                              : varDir === 'shortfall' ? `Shortfall ${fmtInr(varAbs)}`
                              : '—';
                return (
                  <div key={r.key} className="border rounded-lg p-3 bg-white" data-testid={`dc-row-${r.key}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${r.color}`} />
                        <span className="text-sm font-semibold text-gray-800">{r.label}</span>
                      </div>
                      {existing[r.key] && <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Saved</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase">Book</p>
                        <p className="font-semibold text-gray-700">{fmtInr(r.book)}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-gray-500">Actual *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={actuals[r.key] ?? ''}
                          onChange={(e) => setActuals({ ...actuals, [r.key]: e.target.value })}
                          className={`h-8 mt-0.5 text-sm ${r.ring}`}
                          data-testid={`dc-actual-${r.key}`}
                        />
                      </div>
                    </div>
                    <div className={`mt-2 border rounded px-2 py-1 text-[11px] font-semibold flex items-center justify-between ${varStyle}`}>
                      <span>{varLabel}</span>
                      {varDir === 'shortfall' && <AlertTriangle className="h-3 w-3" />}
                    </div>
                    <Input
                      value={remarks[r.key] ?? ''}
                      onChange={(e) => setRemarks({ ...remarks, [r.key]: e.target.value })}
                      placeholder={r.variance ? 'Remark (required for variance)' : 'Remark (optional)'}
                      className="mt-2 h-7 text-xs"
                      data-testid={`dc-remark-${r.key}`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Totals strip */}
            <div className="mt-3 rounded-lg border bg-gray-900 text-white p-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-gray-400 text-[10px] uppercase">Total Book</p>
                <p className="font-semibold">{fmtInr(totals.book)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-[10px] uppercase">Total Actual</p>
                <p className="font-semibold">{fmtInr(totals.actual)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-[10px] uppercase">Total Variance</p>
                <p className={`font-semibold ${totals.variance === 0 ? 'text-emerald-300' : totals.variance > 0 ? 'text-blue-300' : 'text-red-300'}`}>{fmtInr(totals.variance)}</p>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={save} disabled={saving || loading} data-testid="dc-save">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            {saving ? 'Saving…' : 'Save Closing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
