import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2, CreditCard, Banknote, Building2, Smartphone, ChevronDown, ChevronUp, ArrowRightLeft } from 'lucide-react';
import { NumericInput } from './NumericInput';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash', icon: Banknote, color: 'text-green-600' },
  { value: 'cheque', label: 'Cheque', icon: CreditCard, color: 'text-blue-600' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2, color: 'text-purple-600' },
  { value: 'savings_account', label: 'Savings A/c', icon: Building2, color: 'text-cyan-600' },
  { value: 'escrow', label: 'Escrow', icon: Smartphone, color: 'text-orange-600' },
  { value: 'direct_transfer', label: 'Direct Transfer (DT)', icon: ArrowRightLeft, color: 'text-emerald-600' },
];

const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export function MultiPaymentInput({ totalAmount, entries, onChange, allowPartial = false }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const addEntry = () => {
    const remaining = totalAmount - entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const today = new Date().toISOString().split('T')[0];
    onChange([...entries, { amount: remaining > 0 ? String(remaining) : '', payment_mode: 'cash', reference: '', payment_date: today, cheque_details: [] }]);
    setExpandedIdx(entries.length);
  };

  const removeEntry = (idx) => {
    onChange(entries.filter((_, i) => i !== idx));
    setExpandedIdx(null);
  };

  const updateEntry = (idx, field, value) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], [field]: value };
    // When mode is changed to cheque, ensure at least one cheque-detail row exists
    // and auto-expand the cheque section so the user sees they need to fill it in.
    if (field === 'payment_mode' && value === 'cheque') {
      const existing = updated[idx].cheque_details || [];
      if (existing.length === 0) {
        updated[idx].cheque_details = [{ cheque_number: '', bank_name: '', amount: '', cheque_date: '' }];
      }
      setExpandedIdx(idx);
    }
    onChange(updated);
  };

  const addCheque = (idx) => {
    const updated = [...entries];
    const cheques = [...(updated[idx].cheque_details || [])];
    cheques.push({ cheque_number: '', bank_name: '', amount: '', cheque_date: '' });
    updated[idx] = { ...updated[idx], cheque_details: cheques };
    onChange(updated);
  };

  const updateCheque = (entryIdx, chequeIdx, field, value) => {
    const updated = [...entries];
    const cheques = [...(updated[entryIdx].cheque_details || [])];
    cheques[chequeIdx] = { ...cheques[chequeIdx], [field]: value };
    updated[entryIdx] = { ...updated[entryIdx], cheque_details: cheques };
    onChange(updated);
  };

  const removeCheque = (entryIdx, chequeIdx) => {
    const updated = [...entries];
    const cheques = (updated[entryIdx].cheque_details || []).filter((_, i) => i !== chequeIdx);
    updated[entryIdx] = { ...updated[entryIdx], cheque_details: cheques };
    onChange(updated);
  };

  const totalEntered = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const remaining = totalAmount - totalEntered;
  const isBalanced = Math.abs(remaining) < 1;
  const isOver = remaining < -1;

  return (
    <div className="space-y-2" data-testid="multi-payment-input">
      {/* Summary Bar */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">{allowPartial ? 'Balance' : 'Total'}: <span className="font-bold text-gray-800">{fmtCurrency(totalAmount)}</span></span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">Entered: <span className={`font-bold ${isOver ? 'text-red-600' : totalEntered > 0 ? 'text-green-600' : 'text-orange-600'}`}>{fmtCurrency(totalEntered)}</span></span>
          {isOver && <Badge className="text-[10px] bg-red-100 text-red-700">{fmtCurrency(Math.abs(remaining))} over</Badge>}
          {!isOver && !isBalanced && remaining > 0 && totalEntered > 0 && allowPartial && <Badge className="text-[10px] bg-blue-100 text-blue-700">Partial - {fmtCurrency(remaining)} remaining</Badge>}
          {!isOver && !isBalanced && remaining > 0 && !allowPartial && <Badge className="text-[10px] bg-orange-100 text-orange-700">{fmtCurrency(remaining)} remaining</Badge>}
          {isBalanced && <Badge className="text-[10px] bg-green-100 text-green-700">{allowPartial ? 'Full Amount' : 'Balanced'}</Badge>}
        </div>
        <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
          onClick={addEntry} data-testid="add-payment-entry-btn">
          <Plus className="h-3 w-3" /> Add Payment
        </Button>
      </div>

      {/* Payment Entries */}
      {entries.map((entry, idx) => {
        const modeConfig = PAYMENT_MODES.find(m => m.value === entry.payment_mode) || PAYMENT_MODES[0];
        const ModeIcon = modeConfig.icon;
        const isExpanded = expandedIdx === idx;

        return (
          <Card key={idx} className="border transition-shadow hover:shadow-sm" data-testid={`payment-entry-${idx}`}>
            <CardContent className="p-2.5">
              {/* Compact Row */}
              <div className="flex items-center gap-2">
                <ModeIcon className={`h-4 w-4 shrink-0 ${modeConfig.color}`} />
                <Select value={entry.payment_mode} onValueChange={(v) => updateEntry(idx, 'payment_mode', v)}>
                  <SelectTrigger className="h-7 w-[120px] text-xs" data-testid={`payment-mode-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <NumericInput placeholder="Amount" className="h-7 flex-1 text-xs font-semibold"
                  value={entry.amount} onChange={(e) => updateEntry(idx, 'amount', e.target.value)}
                  data-testid={`payment-amount-${idx}`} />
                <Input
                  type="date"
                  className="h-7 w-[125px] text-[11px]"
                  value={entry.payment_date || ''}
                  onChange={(e) => updateEntry(idx, 'payment_date', e.target.value)}
                  title="Payment date (defaults to today)"
                  data-testid={`payment-date-${idx}`}
                />
                {entry.payment_mode !== 'cheque' && (
                  <Input placeholder="Ref / Txn ID" className="h-7 w-[120px] text-xs"
                    value={entry.reference} onChange={(e) => updateEntry(idx, 'reference', e.target.value)} />
                )}
                {entry.payment_mode === 'cheque' && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px] gap-0.5 px-1.5"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}>
                    {(entry.cheque_details || []).length} cheque{(entry.cheque_details || []).length !== 1 ? 's' : ''}
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                )}
                {entries.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeEntry(idx)} data-testid={`remove-payment-${idx}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Cheque Details (expanded) */}
              {entry.payment_mode === 'cheque' && isExpanded && (
                <div className="mt-2 pl-6 space-y-1.5 border-l-2 border-blue-200">
                  {(entry.cheque_details || []).map((chq, ci) => (
                    <div key={ci} className="flex items-center gap-1.5 flex-wrap" data-testid={`cheque-detail-${idx}-${ci}`}>
                      <Input placeholder="Cheque No" className="h-7 w-[110px] text-[10px]"
                        value={chq.cheque_number} onChange={(e) => updateCheque(idx, ci, 'cheque_number', e.target.value)} />
                      <Input placeholder="Bank" className="h-7 w-[100px] text-[10px]"
                        value={chq.bank_name} onChange={(e) => updateCheque(idx, ci, 'bank_name', e.target.value)} />
                      <NumericInput placeholder="Amount" className="h-7 w-[140px] text-[11px] font-semibold"
                        value={chq.amount} onChange={(e) => updateCheque(idx, ci, 'amount', e.target.value)} />
                      <Input type="date" className="h-7 w-[120px] text-[10px]"
                        value={chq.cheque_date} onChange={(e) => updateCheque(idx, ci, 'cheque_date', e.target.value)} />
                      <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400"
                        onClick={() => removeCheque(idx, ci)}>
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="h-5 text-[10px] gap-0.5 border-blue-200 text-blue-600"
                    onClick={() => addCheque(idx)} data-testid={`add-cheque-${idx}`}>
                    <Plus className="h-2.5 w-2.5" /> Add Cheque
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {entries.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-xs border rounded-lg border-dashed">
          Click "Add Payment" to add payment entries
        </div>
      )}
    </div>
  );
}
