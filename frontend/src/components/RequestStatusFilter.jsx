import React from 'react';
import { Card, CardContent } from './ui/card';
import { Clock, RotateCw, FileText, CheckCircle2, XCircle } from 'lucide-react';

/**
 * RequestStatusFilter — reusable "Req Handling" status pipeline.
 *
 * 5 cards: New Requests · In Progress · Awaiting Approval · Approved · Rejected.
 * Click a card to filter the underlying list to that status. Clicking the
 * already-selected card clears the filter (returns to 'all').
 *
 * Use this anywhere a list of requests needs a status-stage filter:
 *   <RequestStatusFilter counts={...} value={...} onChange={...} />
 */
const STATUSES = [
  { key: 'new',          label: 'New Requests',     Icon: Clock,         color: 'text-orange-500',  ring: 'ring-orange-500',  border: 'border-orange-200',  num: 'text-orange-600' },
  { key: 'in_progress',  label: 'In Progress',      Icon: RotateCw,      color: 'text-amber-500',   ring: 'ring-amber-500',   border: 'border-amber-200',   num: 'text-amber-600' },
  { key: 'awaiting',     label: 'Awaiting Approval',Icon: FileText,      color: 'text-violet-500',  ring: 'ring-violet-500',  border: 'border-violet-200',  num: 'text-violet-600' },
  { key: 'approved',     label: 'Approved',         Icon: CheckCircle2,  color: 'text-green-500',   ring: 'ring-green-500',   border: 'border-green-200',   num: 'text-green-600' },
  { key: 'rejected',     label: 'Rejected',         Icon: XCircle,       color: 'text-red-500',     ring: 'ring-red-500',     border: 'border-red-200',     num: 'text-red-600' },
];

/**
 * Map ANY backend status string into one of the 5 canonical buckets.
 * Each module talks slightly differently, so callers shouldn't have to
 * normalise upstream — let this helper do it.
 */
export const mapToReqStatus = (raw) => {
  const s = (raw || '').toString().trim().toLowerCase();
  if (!s) return 'new';
  if (['requested', 'pending', 'new', 'submitted', 'open'].includes(s)) return 'new';
  if (['in_progress', 'in-progress', 'under_review', 'reviewing', 'processing'].includes(s)) return 'in_progress';
  if (['planning_approved', 'pm_approved', 'awaiting_approval', 'pending_payment', 'pending_accountant', 'pending_approval', 'sent_for_approval'].includes(s)) return 'awaiting';
  if (['approved', 'fulfilled', 'paid', 'completed', 'closed', 'done', 'settled'].includes(s)) return 'approved';
  if (['rejected', 'cancelled', 'canceled', 'denied'].includes(s)) return 'rejected';
  return 'new';
};

export default function RequestStatusFilter({ counts = {}, value = 'all', onChange, dataTestId = 'req-status-filter' }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" data-testid={dataTestId}>
      {STATUSES.map(s => {
        const Icon = s.Icon;
        const isActive = value === s.key;
        return (
          <Card
            key={s.key}
            onClick={() => onChange?.(isActive ? 'all' : s.key)}
            className={`cursor-pointer transition-all border-2 ${s.border} ${isActive ? `ring-2 ${s.ring} shadow-md` : 'hover:shadow-sm'}`}
            data-testid={`req-status-card-${s.key}`}
          >
            <CardContent className="p-3 flex flex-col items-center text-center gap-1">
              <Icon className={`h-6 w-6 ${s.color}`} />
              <span className={`text-2xl font-bold ${s.num}`} data-testid={`req-status-count-${s.key}`}>
                {counts[s.key] ?? 0}
              </span>
              <span className={`text-[11px] font-medium ${s.num}`}>{s.label}</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
