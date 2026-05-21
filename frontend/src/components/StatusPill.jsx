import React from "react";
import { Badge } from "./ui/badge";

/**
 * Unified 4-state status pill used by the Correction Engine flows
 * (petty cash, material requests, lead advance, etc.).
 *
 * Maps a wide variety of legacy backend statuses onto exactly 4 visual states:
 *   - awaiting   (amber)  — pending accountant review
 *   - rejected   (red)    — accountant rejected; original requester must edit + resubmit
 *   - approved   (green)  — approved and counting in cashbook / cashflow / totals
 *   - correction (red)    — was approved, accountant pulled it back. Cashflow rolled back.
 */
const STATE_MAP = {
  // awaiting (pre-approval review queue)
  awaiting_accountant: "awaiting",
  pending: "awaiting",
  pending_approval: "awaiting",
  pm_approved: "awaiting",
  planning_approved: "awaiting",
  pending_accounts_approval: "awaiting",
  accountant_pending: "awaiting",
  requested: "awaiting",
  // rejected (never approved — original requester must edit + resubmit)
  accountant_rejected: "rejected",
  rejected: "rejected",
  accounts_rejected: "rejected",
  pm_rejected: "rejected",
  // approved (counts everywhere)
  approved: "approved",
  accounts_approved: "approved",
  verified: "approved",
  accountant_verified: "approved",
  issued: "approved",
  settled: "approved",
  partially_settled: "approved",
  completed: "approved",
  payment_done: "approved",
  // under_correction (was approved, accountant pulled back)
  under_correction: "correction",
};

const STYLES = {
  awaiting: {
    label: "Awaiting Accountant",
    cls: "bg-amber-100 text-amber-800 border border-amber-300",
    dot: "bg-amber-500",
  },
  rejected: {
    label: "Rejected",
    cls: "bg-red-100 text-red-800 border border-red-300",
    dot: "bg-red-500 animate-pulse",
  },
  approved: {
    label: "Approved",
    cls: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    dot: "bg-emerald-500",
  },
  correction: {
    label: "Under Correction",
    cls: "bg-red-100 text-red-800 border border-red-300",
    dot: "bg-red-500 animate-pulse",
  },
};

export const StatusPill = ({ status, label, className = "", "data-testid": testId, onClick }) => {
  const state = STATE_MAP[status] || "awaiting";
  const cfg = STYLES[state];
  const showLabel = label || cfg.label;
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      data-testid={testId || `status-pill-${state}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.cls} ${clickable ? "cursor-pointer hover:scale-105 transition" : "cursor-default"} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {showLabel}
    </button>
  );
};

/** Returns the canonical state name for any backend status. Useful for guards. */
export const pillState = (status) => STATE_MAP[status] || "awaiting";

export default StatusPill;
