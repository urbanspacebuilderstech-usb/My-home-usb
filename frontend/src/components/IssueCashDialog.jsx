// Reusable Issue Cash / Approve Expense dialog with payment-mode capture.
// Used by Accountant Approvals → Petty Cash for both:
//   • Req Petty Cash → Issue Cash (calls PATCH /accountant/petty-cash/{id}/issue)
//   • Record Expense → Approve     (calls PATCH /accountant/recorded-expenses/{id}/approve)
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Wallet, CheckCircle, AlertTriangle } from 'lucide-react';

// 6 payment modes the user asked for.
export const PAYMENT_MODES = [
  { value: 'cash',            label: 'Cash' },
  { value: 'hdfc_current',    label: 'HDFC Current' },
  { value: 'hdfc_savings',    label: 'HDFC Savings' },
  { value: 'cheque',          label: 'Cheque' },
  { value: 'direct_transfer', label: 'Direct Transfer (Cash DT)' },
  { value: 'suspense',        label: 'Suspense' },
];

const isBank   = (m) => m === 'hdfc_current' || m === 'hdfc_savings' || m === 'direct_transfer';
const isCheque = (m) => m === 'cheque';

/**
 * Props:
 *  open: bool
 *  onOpenChange(open): void
 *  variant: 'issue' | 'approve'      // changes title/CTA + intent
 *  defaultAmount: number
 *  amountEditable?: boolean = true
 *  title?: string
 *  subtitle?: string                 // e.g., "Harish Kumar M • Site expenses"
 *  onSubmit({ amount, payment_mode, reference_number, bank_name, cheque_date, payment_date, remarks }): Promise
 */
export default function IssueCashDialog({
  open,
  onOpenChange,
  variant = 'issue',
  defaultAmount = 0,
  amountEditable = true,
  title,
  subtitle,
  onSubmit,
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [refNum, setRefNum] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount);
      setPaymentMode('cash');
      setRefNum(''); setBankName(''); setChequeDate('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setRemarks(''); setBusy(false);
    }
  }, [open, defaultAmount]);

  const refLabel = isCheque(paymentMode) ? 'Cheque Number *'
    : isBank(paymentMode) ? 'Transaction / UTR / Reference *'
    : paymentMode === 'suspense' ? 'Suspense Reference (optional)'
    : 'Reference (optional)';
  const refRequired = isCheque(paymentMode) || isBank(paymentMode);

  const handleSubmit = async () => {
    if (!amount || amount <= 0) { return; }
    if (refRequired && !refNum.trim()) { return; }
    setBusy(true);
    try {
      await onSubmit({
        amount: Number(amount),
        payment_mode: paymentMode,
        reference_number: refNum || null,
        bank_name: bankName || null,
        cheque_date: chequeDate || null,
        payment_date: paymentDate ? new Date(paymentDate).toISOString() : null,
        remarks: remarks || null,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const isApprove = variant === 'approve';
  const headerIcon = isApprove ? <CheckCircle className="h-5 w-5 text-emerald-700" /> : <Wallet className="h-5 w-5 text-emerald-700" />;
  const cta = isApprove ? 'Approve & Record' : 'Issue Cash';

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md" data-testid="issue-cash-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {headerIcon} {title || (isApprove ? 'Approve Recorded Expense' : 'Issue Petty Cash')}
          </DialogTitle>
          {subtitle && <DialogDescription className="text-xs">{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Amount *</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              disabled={!amountEditable}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              data-testid="issue-cash-amount"
            />
          </div>

          <div>
            <Label className="text-xs">Mode of Payment *</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger className="mt-1" data-testid="issue-cash-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map(m => (
                  <SelectItem key={m.value} value={m.value} data-testid={`issue-cash-mode-${m.value}`}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {paymentMode !== 'cash' && (
            <div>
              <Label className="text-xs">{refLabel}</Label>
              <Input
                value={refNum}
                onChange={(e) => setRefNum(e.target.value)}
                placeholder={isCheque(paymentMode) ? 'e.g., 100234' : isBank(paymentMode) ? 'e.g., UTR2026123456' : ''}
                className="mt-1"
                data-testid="issue-cash-reference"
              />
              {refRequired && !refNum.trim() && (
                <p className="text-[10px] text-red-600 mt-0.5 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Reference is required for {PAYMENT_MODES.find(m => m.value === paymentMode)?.label}</p>
              )}
            </div>
          )}

          {(isBank(paymentMode) || isCheque(paymentMode)) && (
            <div>
              <Label className="text-xs">Bank Name {isCheque(paymentMode) ? '*' : '(optional)'}</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g., HDFC Bank" className="mt-1" data-testid="issue-cash-bank" />
            </div>
          )}

          {isCheque(paymentMode) && (
            <div>
              <Label className="text-xs">Cheque Date *</Label>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="mt-1" data-testid="issue-cash-cheque-date" />
            </div>
          )}

          <div>
            <Label className="text-xs">Payment Date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" data-testid="issue-cash-payment-date" />
          </div>

          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes for the audit trail…" className="mt-1 text-sm" data-testid="issue-cash-remarks" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy} data-testid="issue-cash-cancel">Cancel</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={handleSubmit} disabled={busy || (refRequired && !refNum.trim()) || !amount || amount <= 0} data-testid="issue-cash-submit">
            {headerIcon} {busy ? '…' : cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
