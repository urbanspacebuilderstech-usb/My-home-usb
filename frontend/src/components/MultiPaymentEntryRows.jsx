// Reusable multi-mode payment entry rows for Accountant Release dialogs.
// Used by:
//   - LabourRABReleaseDialog (Labour RAB + Material vendor)
//   - PettyCashIssueDialog
//   - any other release flow needing split payment by mode
//
// Yields `payment_entries: [{ method, amount, bank_ref?, cheque_ids?, cheque_no? }]`.
// Validation: sum(amounts) must equal `targetTotal`.
// Multiple cheque rows allowed (each row can independently pick from available cheques).
import { useMemo } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Banknote, CreditCard, Building2, PiggyBank, Plus, X, Search, ArrowRightLeft, Shield } from 'lucide-react';

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
        // Auto-sum row amount from picked cheques
        const sumCheques = availableCheques
          .filter((c) => next.includes(c.cheque_id))
          .reduce((s, c) => s + (Number(c.amount) || 0), 0);
        return { ...r, cheque_ids: next, amount: sumCheques };
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
                claimedByOthers={claimedByOtherRows(idx)}
                onToggle={(cid) => toggleCheque(idx, cid)}
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

function ChequePickerSubRow({ idx, row, allCheques, claimedByOthers, onToggle }) {
  const selectedIds = row.cheque_ids || [];
  // Hide cheques already used by other rows. Always show those selected by THIS row.
  const visible = allCheques.filter(
    (c) => selectedIds.includes(c.cheque_id) || !claimedByOthers.has(c.cheque_id)
  );

  if (visible.length === 0) {
    return (
      <p className="text-[11px] text-amber-700 italic px-1">
        No open HDFC cheques available for this row. Switch to another method or open more cheques.
      </p>
    );
  }

  return (
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
  );
}
