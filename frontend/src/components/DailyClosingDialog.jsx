/**
 * Daily Closing Balance dialog.
 *
 * Renders a 5-mode form (Cash · HDFC Current · HDFC Savings · Cheque · Cash DT)
 * pre-filled with the computed book balance the caller passes in. Each mode
 * supports MULTIPLE sub-entries (Cash Box A / Cash Box B / Site-1 cash / …) —
 * the total across the sub-entries = actual balance for that mode. The API
 * upserts one `daily_closings` row per mode for the chosen date.
 *
 * Props:
 *   open            bool
 *   onClose         fn()
 *   date            'YYYY-MM-DD' — target close date (usually today)
 *   computed        { cash, current_account, savings_account, cheque, direct_transfer }
 *   onSaved         fn() — parent reload trigger
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Wallet, Building2, Landmark, FileText, ArrowLeftRight, Loader2, CheckCircle2, AlertTriangle, Plus, Trash2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODES = [
  { key: 'cash',              label: 'Cash',         icon: Wallet,          color: 'text-amber-600'   },
  { key: 'current_account',   label: 'HDFC Current', icon: Building2,       color: 'text-blue-600'    },
  { key: 'savings_account',   label: 'HDFC Savings', icon: Landmark,        color: 'text-emerald-600' },
  { key: 'cheque',            label: 'Cheque',       icon: FileText,        color: 'text-violet-600'  },
  { key: 'direct_transfer',   label: 'Cash DT',      icon: ArrowLeftRight,  color: 'text-rose-600'    },
];

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Blank sub-entry row template.
const newRow = () => ({ label: '', amount: '' });

export default function DailyClosingDialog({ open, onClose, date, computed, onSaved }) {
  // Per-mode dynamic sub-entry list. Start with a single blank row so the
  // form is visually consistent even before the accountant adds sources.
  const [subs, setSubs] = useState(() => {
    const init = {};
    MODES.forEach(m => { init[m.key] = [newRow()]; });
    return init;
  });
  const [remarks, setRemarks] = useState({});
  const [existing, setExisting] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Track which date we've already loaded so unsaved edits survive
  // close-and-reopen cycles. We only reset the form when the target date
  // changes or when a save/reset is explicitly triggered.
  const loadedForDate = useRef(null);

  // Load any already-saved rows so re-opening pre-populates.
  useEffect(() => {
    if (!open) return;
    if (loadedForDate.current === date) return; // Preserve unsaved edits
    loadedForDate.current = date;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${API}/accountant/daily-closing`, { params: { date } });
        const t = r.data?.today || {};
        setExisting(t);
        const nextSubs = {};
        const nextRemarks = {};
        MODES.forEach(m => {
          const row = t[m.key];
          if (row) {
            const savedSubs = Array.isArray(row.sub_entries) ? row.sub_entries : [];
            if (savedSubs.length > 0) {
              nextSubs[m.key] = savedSubs.map(s => ({ label: s.label || '', amount: String(s.amount ?? '') }));
            } else {
              // Legacy row saved before sub_entries existed — just seed one
              // row prefilled with the previously saved actual_balance.
              nextSubs[m.key] = [{ label: 'Total', amount: String(row.actual_balance ?? '') }];
            }
            nextRemarks[m.key] = row.remark || '';
          } else {
            // First close of the day — seed a single row prefilled with the
            // computed book balance so the accountant only edits what's off.
            nextSubs[m.key] = [{ label: '', amount: String(computed?.[m.key] ?? '') }];
            nextRemarks[m.key] = '';
          }
        });
        setSubs(nextSubs);
        setRemarks(nextRemarks);
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Failed to load closing state');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, date, computed]);

  const rows = useMemo(() => MODES.map(m => {
    const list = subs[m.key] || [];
    const book = Number(computed?.[m.key] ?? 0);
    const total = list.reduce((s, r) => {
      const n = Number(r.amount);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    const variance = +(total - book).toFixed(2);
    return { ...m, book, list, total, variance };
  }), [computed, subs]);

  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.book += r.book;
    acc.actual += r.total;
    acc.variance += r.variance;
    return acc;
  }, { book: 0, actual: 0, variance: 0 }), [rows]);

  const updateSub = (mode, idx, patch) => {
    setSubs(prev => {
      const list = [...(prev[mode] || [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, [mode]: list };
    });
  };
  const addSub = (mode) => {
    setSubs(prev => ({ ...prev, [mode]: [...(prev[mode] || []), newRow()] }));
  };
  const removeSub = (mode, idx) => {
    setSubs(prev => {
      const list = [...(prev[mode] || [])];
      list.splice(idx, 1);
      // Always leave at least one row visible.
      return { ...prev, [mode]: list.length ? list : [newRow()] };
    });
  };

  const save = async () => {
    // Validate — every row's amount must parse to a finite number.
    for (const m of MODES) {
      const list = subs[m.key] || [];
      for (let i = 0; i < list.length; i++) {
        const v = list[i].amount;
        if (v === '' || v == null || Number.isNaN(Number(v))) {
          toast.error(`${m.label} · row ${i + 1} — enter a valid amount`);
          return;
        }
      }
    }
    // Force a remark whenever a mode has non-zero variance.
    const missingRemark = rows.find(r => r.variance !== 0 && !(remarks[r.key] || '').trim());
    if (missingRemark) { toast.error(`${missingRemark.label} has variance ${fmtInr(missingRemark.variance)} — please add a remark.`); return; }

    setSaving(true);
    try {
      await axios.post(`${API}/accountant/daily-closing`, {
        date,
        entries: rows.map(r => ({
          mode: r.key,
          computed_balance: r.book,
          actual_balance: r.total,
          remark: remarks[r.key] || '',
          sub_entries: r.list.map(s => ({ label: s.label || '', amount: Number(s.amount || 0) })),
        })),
      });
      toast.success(`Closing saved for ${date}`);
      // Force a fresh reload of saved rows the next time this dialog opens.
      loadedForDate.current = null;
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
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="daily-closing-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <CheckCircle2 className="h-5 w-5" /> Close Books · {date}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter the actual cash / bank / cheque position at end of day. Add multiple sub-sources per mode (Cash Box A, Site-1 cash, etc.). Variances vs the ledger are stored for reconciliation.
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
                const varDir = r.variance === 0 ? 'match' : r.variance > 0 ? 'surplus' : 'shortfall';
                const varStyle = varDir === 'match' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : varDir === 'surplus' ? 'text-blue-700 bg-blue-50 border-blue-200'
                              : 'text-red-700 bg-red-50 border-red-200';
                const varLabel = varDir === 'match' ? 'Matched'
                              : varDir === 'surplus' ? `Surplus ${fmtInr(varAbs)}`
                              : `Shortfall ${fmtInr(varAbs)}`;
                return (
                  <div key={r.key} className="border rounded-lg p-3 bg-white" data-testid={`dc-row-${r.key}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${r.color}`} />
                        <span className="text-sm font-semibold text-gray-800">{r.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {existing[r.key] && <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Saved</span>}
                        <span className="text-[10px] text-gray-500">Book: <strong className="text-gray-700">{fmtInr(r.book)}</strong></span>
                      </div>
                    </div>

                    {/* Dynamic sub-entry rows. Add as many as needed. */}
                    <div className="space-y-1.5">
                      {r.list.map((sub, idx) => (
                        <div key={idx} className="flex items-center gap-1.5" data-testid={`dc-sub-${r.key}-${idx}`}>
                          <Input
                            value={sub.label}
                            onChange={(e) => updateSub(r.key, idx, { label: e.target.value })}
                            placeholder={idx === 0 ? 'e.g. Cash Box A' : 'Source label'}
                            className="h-8 flex-1 text-xs"
                            data-testid={`dc-sub-label-${r.key}-${idx}`}
                          />
                          <Input
                            type="number"
                            step="0.01"
                            value={sub.amount}
                            onChange={(e) => updateSub(r.key, idx, { amount: e.target.value })}
                            placeholder="₹ Amount"
                            className="h-8 w-32 text-xs text-right"
                            data-testid={`dc-sub-amount-${r.key}-${idx}`}
                          />
                          <button
                            type="button"
                            onClick={() => removeSub(r.key, idx)}
                            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={r.list.length <= 1}
                            title={r.list.length <= 1 ? 'At least one row required' : 'Remove'}
                            data-testid={`dc-sub-remove-${r.key}-${idx}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => addSub(r.key)}
                      className="mt-2 text-[10px] text-amber-700 hover:text-amber-900 flex items-center gap-1 font-medium"
                      data-testid={`dc-sub-add-${r.key}`}
                    >
                      <Plus className="h-3 w-3" /> Add another source
                    </button>

                    {/* Total + variance strip */}
                    <div className={`mt-2 border rounded px-2 py-1 text-[11px] font-semibold flex items-center justify-between ${varStyle}`}>
                      <span>Actual total: <strong>{fmtInr(r.total)}</strong></span>
                      <span className="flex items-center gap-1">
                        {varDir === 'shortfall' && <AlertTriangle className="h-3 w-3" />}
                        {varLabel}
                      </span>
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
