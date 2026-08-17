import React from 'react';

// Aug 18 2026 — "A/C Received": the date an entry landed in the Accountant's
// queue, shown on every card in Accounts → Approvals → Expense Approvals
// (Materials / Labour Work Order / Petty Cash).
//
// The three tabs are fed by three different endpoints reading three different
// collections, each of which reaches Accounts through its own transition
// (procurement verify / planning forward / PM approve). The backend resolves
// all of them into one `accounts_received_at` field — see
// financial.stamp_accounts_received — so every card can render it the same
// way through this component instead of each one picking its own date field.
//
// `fallback` covers rows with no usable timestamp at all: an em dash reads as
// "not recorded", where a silently missing line reads as a broken card.
export function formatAccountsReceived(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Labelled grid cell — matches the surrounding
// "<p uppercase label><p value>" pairs used by the approval cards.
export default function AccountsReceivedDate({ value, testId, label = 'A/C Received' }) {
  const text = formatAccountsReceived(value);
  return (
    <div data-testid={testId}>
      <p className="text-[10px] uppercase text-gray-400 font-semibold">{label}</p>
      <p
        className={`font-medium truncate ${text ? '' : 'text-gray-400'}`}
        title={value ? new Date(value).toLocaleString('en-IN') : 'Not recorded'}
      >
        {text || '—'}
      </p>
    </div>
  );
}
