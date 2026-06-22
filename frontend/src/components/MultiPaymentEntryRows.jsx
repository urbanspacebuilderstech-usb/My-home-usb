// Reusable multi-mode payment entry rows for Accountant Release dialogs.
// Used by:
//   - LabourRABReleaseDialog (Labour RAB + Material vendor)
//   - PettyCashIssueDialog
//   - any other release flow needing split payment by mode
//
// Yields `payment_entries: [{ method, amount, bank_ref?, cheque_ids?, cheque_no? }]`.
// Validation: sum(amounts) must equal `targetTotal`.
// Multiple cheque rows allowed (each row can independently pick from available cheques).
import { useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Banknote, CreditCard, Building2, PiggyBank, Plus, X, Search, ArrowRightLeft, Shield, Lock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const METHOD_META = {
  savings_account: { label: 'HDFC SAVINGS', Icon: PiggyBank,      color: 'indigo' },
  current_account: { label: 'HDFC CURRENT', Icon: Building2,      color: 'sky'    },
  direct_transfer: { label: 'CASH D/T',     Icon: ArrowRightLeft, color: 'emerald'},
  cash:            { label: 'Cash',         Icon: Banknote,       color: 'green'  },
  cheque:          { label: 'Cheque',       Icon: CreditCard,     color: 'blue'   },
  escrow:          { label: 'Escrow',       Icon: Shield,         color: 'orange' },
};

const ALL_METHODS = Object.keys(METHOD_META);

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function MultiPaymentEntryRows({
  entries,
  setEntries,
  targetTotal,
  availableCheques = [],
  inactiveCheques = [],
  onChequeOpenRequested,
}) {
  const sum = useMemo(
    () => entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [entries]
  );
  const remaining = Number(targetTotal || 0) - sum;
  const matches = Math.abs(remaining) < 0.5;

  const update = (idx, patch) => {
    setEntries((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx) => setEntries((rows) => rows.filter((_, i) => i !== idx));
  const add = () => {
    // Auto-fill remaining amount on the new row if positive.
    const def = remaining > 0 ? remaining : 0;
    setEntries((rows) => [
      ...rows,
      { method: 'cash', amount: def, bank_ref: '', cheque_ids: [], cheque_no: '' },
    ]);
  };
  const toggleCheque = (idx, chequeId) => {
    setEntries((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const cur = r.cheque_ids || [];
        const next = cur.includes(chequeId) ? cur.filter((x) => x !== chequeId) : [...cur, chequeId];
        // Auto-sum row amount from picked cheques, but CAP at the remaining
        // payable (sum of other rows' amounts subtracted from targetTotal).
        // Any overshoot becomes a contractor-suspense credit on the backend.
        // Feb 20 2026 — Mr Sudharsan / Appala Naidu ₹1,00,000 cheque vs
        // ₹60,672 bill case: extra ₹39,328 now flows to Suspense Account
        // instead of disabling Process Release.
        const sumCheques = availableCheques
          .filter((c) => next.includes(c.cheque_id))
          .reduce((s, c) => s + (Number(c.amount) || 0), 0);
        const otherRowsSum = rows.reduce((s, e, j) => (j === i ? s : s + (Number(e.amount) || 0)), 0);
        const cap = Math.max(0, (Number(targetTotal) || 0) - otherRowsSum);
        const amountForBill = Math.min(sumCheques, cap);
        return { ...r, cheque_ids: next, amount: amountForBill, cheque_total: sumCheques };
      })
    );
  };

  // Cheques already claimed by OTHER rows so we don't double-allocate.
  const claimedByOtherRows = (idx) => {
    const claimed = new Set();
    entries.forEach((e, i) => {
      if (i !== idx) (e.cheque_ids || []).forEach((c) => claimed.add(c));
    });
    return claimed;
  };

  return (
    <div className="space-y-2" data-testid="multi-payment-rows">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Payment Method(s)</Label>
        <span className={`text-[11px] font-medium ${matches ? 'text-emerald-700' : 'text-amber-700'}`} data-testid="multi-pay-total-state">
          Total {fmt(sum)} / {fmt(targetTotal)} {matches ? '✓' : `(${remaining > 0 ? '+' : ''}${fmt(remaining)} remaining)`}
        </span>
      </div>

      {entries.length === 0 && (
        <p className="text-[11px] text-gray-400 italic">No payment row yet. Click "+ Add method" to start.</p>
      )}

      {entries.map((row, idx) => {
        const meta = METHOD_META[row.method] || METHOD_META.cash;
        const Icon = meta.Icon;
        return (
          <div key={idx} className="border rounded-md p-2 bg-gray-50/50 space-y-2" data-testid={`multi-pay-row-${idx}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Icon className={`h-3.5 w-3.5 text-${meta.color}-700`} />
                <select
                  value={row.method}
                  onChange={(e) => update(idx, { method: e.target.value, cheque_ids: [], cheque_no: '', bank_ref: '' })}
                  className="h-7 text-xs border rounded px-1 bg-white"
                  data-testid={`multi-pay-row-${idx}-method`}
                >
                  {ALL_METHODS.map((m) => (
                    <option key={m} value={m}>{METHOD_META[m].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-gray-500">Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={row.amount}
                  onChange={(e) => update(idx, { amount: e.target.value })}
                  disabled={row.method === 'cheque' && (row.cheque_ids || []).length > 0}
                  className="h-7 w-28 text-xs"
                  data-testid={`multi-pay-row-${idx}-amount`}
                />
                {row.method === 'cheque' && row.cheque_total > Number(row.amount || 0) && (
                  <span className="text-[9px] text-amber-700 italic" data-testid={`multi-pay-row-${idx}-suspense-excess`}>
                    + {fmt(row.cheque_total - Number(row.amount || 0))} → Suspense
                  </span>
                )}
              </div>
              {(row.method === 'current_account' || row.method === 'savings_account') && (
                <div className="flex items-center gap-1 flex-1 min-w-[140px]">
                  <Label className="text-[10px] text-gray-500">UTR/Ref *</Label>
                  <Input
                    value={row.bank_ref || ''}
                    onChange={(e) => update(idx, { bank_ref: e.target.value })}
                    placeholder="UTRNO123456"
                    className="h-7 text-xs flex-1"
                    data-testid={`multi-pay-row-${idx}-bankref`}
                  />
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 ml-auto"
                onClick={() => remove(idx)}
                data-testid={`multi-pay-row-${idx}-remove`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {row.method === 'cheque' && (
              <ChequePickerSubRow
                idx={idx}
                row={row}
                allCheques={availableCheques}
                inactiveCheques={inactiveCheques}
                claimedByOthers={claimedByOtherRows(idx)}
                onToggle={(cid) => toggleCheque(idx, cid)}
                onRequestOpened={onChequeOpenRequested}
              />
            )}
          </div>
        );
      })}

      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1 border-dashed"
        onClick={add}
        data-testid="multi-pay-add"
      >
        <Plus className="h-3 w-3" /> Add method
      </Button>
    </div>
  );
}

function ChequePickerSubRow({ idx, row, allCheques, inactiveCheques = [], claimedByOthers, onToggle, onRequestOpened }) {
  const selectedIds = row.cheque_ids || [];
  // Hide cheques already used by other rows. Always show those selected by THIS row.
  const visible = allCheques.filter(
    (c) => selectedIds.includes(c.cheque_id) || !claimedByOthers.has(c.cheque_id)
  );
  // Feb 20 2026 — Locked HDFC cheques shown below the picker with a
  // "Request CRE to Open" button. The picker no longer dead-ends with
  // "No open HDFC cheques available" when there are locked ones waiting.
  const visibleLocked = inactiveCheques.filter((c) => !claimedByOthers.has(c.cheque_id));
  const [requestingId, setRequestingId] = useState(null);
  const requestOpen = async (cheque) => {
    if (cheque.open_requested) {
      toast.info('Already requested. CRE will open it.');
      return;
    }
    setRequestingId(cheque.cheque_id);
    try {
      await axios.patch(`${API}/accountant/cheques/${cheque.cheque_id}/request-open`, {
        remarks: 'Needed for Labour RAB release',
      });
      toast.success(`Requested CRE to open ${cheque.cheque_number}`);
      if (onRequestOpened) onRequestOpened(cheque);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to request');
    } finally {
      setRequestingId(null);
    }
  };

  if (visible.length === 0 && visibleLocked.length === 0) {
    return (
      <p className="text-[11px] text-amber-700 italic px-1">
        No cheques available for this row. Switch to another method or open more cheques.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {visible.length > 0 && (
        <div className="border rounded bg-white max-h-32 overflow-y-auto" data-testid={`multi-pay-row-${idx}-cheque-picker`}>
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="w-6 p-1"></th>
                <th className="text-left p-1">Cheque #</th>
                <th className="text-left p-1">Bank</th>
                <th className="text-right p-1">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const sel = selectedIds.includes(c.cheque_id);
            return (
              <tr
                key={c.cheque_id}
                onClick={() => onToggle(c.cheque_id)}
                className={`border-b cursor-pointer hover:bg-emerald-50/40 ${sel ? 'bg-emerald-100/40' : ''}`}
                data-testid={`multi-pay-row-${idx}-cheque-${c.cheque_id}`}
              >
                <td className="p-1 text-center">
                  <input type="checkbox" checked={sel} readOnly className="accent-emerald-600" />
                </td>
                <td className="p-1 font-mono">{c.cheque_number}</td>
                <td className="p-1">{c.bank_name || c.bank || '—'}</td>
                <td className="p-1 text-right font-semibold">{fmt(c.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
        </div>
      )}
      {visibleLocked.length > 0 && (
        <div className="border border-dashed border-amber-300 rounded bg-amber-50/40 p-1.5" data-testid={`multi-pay-row-${idx}-locked-cheques`}>
          <p className="text-[10px] font-semibold text-amber-700 mb-1 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Locked — ask CRE to open before using ({visibleLocked.length})
          </p>
          <div className="max-h-28 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-amber-100/60 border-b sticky top-0">
                <tr>
                  <th className="text-left p-1">Cheque #</th>
                  <th className="text-left p-1">Bank</th>
                  <th className="text-right p-1">Amount</th>
                  <th className="text-right p-1 w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleLocked.map((c) => (
                  <tr key={c.cheque_id} className="border-b" data-testid={`multi-pay-row-${idx}-locked-${c.cheque_id}`}>
                    <td className="p-1 font-mono">{c.cheque_number}</td>
                    <td className="p-1">{c.bank_name || c.bank || '—'}</td>
                    <td className="p-1 text-right font-semibold text-amber-700">{fmt(c.amount)}</td>
                    <td className="p-1 text-right">
                      {c.open_requested ? (
                        <span className="text-[9px] text-amber-600 italic">Requested</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-[9px] px-1.5 border-amber-400 text-amber-700 hover:bg-amber-100"
                          disabled={requestingId === c.cheque_id}
                          onClick={() => requestOpen(c)}
                          data-testid={`multi-pay-row-${idx}-request-open-${c.cheque_id}`}
                        >
                          {requestingId === c.cheque_id ? 'Sending…' : 'Request Open'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
