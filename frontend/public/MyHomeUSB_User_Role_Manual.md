# MyHomeUSB CRM — User Role Manual

_Detailed per-role guide: every login, every screen, every function._

---

## 1. Super Admin

**Login URL**: `/login` (any account flagged `role: super_admin`)
**Home**: Super Admin Dashboard — every module is unlocked.

### Functions
1. **User CRUD** — create / edit / disable any user, assign roles, set passwords, manage slots.
2. **Project Master** — view every project, force-advance status, override frozen WOs.
3. **Cashbook Reversal** — undo any cashbook entry; rolls back stage `amount_released`.
4. **Org Reports** — revenue, margin, pipeline conversion.
5. **Audit Log** — every state-changing API call with actor + before/after diff.
6. **System Config** — payment templates, WO templates, stage templates, GP %, IS %.
7. **Lead Distribution Rules** — round-robin, weighted, solo-mode fallback.
8. **Cheque Management override** — disable/restore cheques, force-issue.
9. **All-Role Impersonation** — switches workspace context to debug as another role.

### Screens
- `/dashboard` — KPI strip + org health.
- `/users` — user grid + edit drawer.
- `/projects` — same project picker as PM but with override icons.
- `/admin/audit` — paginated audit timeline.

---

## 2. General Manager

**Home**: `/dashboard` (GM view).

### Functions
1. **GM Approvals queue** — projects awaiting GM sign-off after Planning.
2. **Revenue Dashboard** — receivables, payables, suspense balance, projected cashflow.
3. **High-value RAB approval** — any RAB above configurable threshold.
4. **Read-only Cashbook**.
5. **Notifications inbox**.

### Approval flow this role touches
- Project advancement: Planning → **GM** → Super Admin.
- Bulk WO approvals over a threshold.

---

## 3. CRE (Client Relationship Officer)

**Home**: `/dashboard` (CRE view).

### Functions
1. **Create Project** — from a Won lead (handover from Sales).
2. **Payment Schedule editor** — drag/drop stages, set due dates, attach milestones.
3. **Cheque collection** — record received cheque, attach photo, send to Accountant.
4. **Stage close-out** — Mark visit done, send confirmation to client.
5. **Client roster** — maintain primary + secondary contacts.
6. **Push to Planning** — once Accountant verifies the first cheque.
7. **Handover certificate** — at project completion.
8. **Notifications + reminders** — auto-fire 7-day reminders for upcoming visits.

### Screens
- `/cre/projects` — pipeline + status filters.
- `/cre/payment-schedule/{id}` — stage editor.
- `/cre/cheques` — collected cheques inbox.

---

## 4. Accountant

**Home**: Finance Board at `/accountant`.

### Functions
1. **Cashbook** — debit / credit ledger; filter by project, expense type, date range.
2. **Approvals queue** (5 sub-tabs):
   - **Income** (CRE cheques) → Accept / Reject → on accept, sweeps to cashbook IN.
   - **Material Payments** (Procurement POs) → Release with multi-mode.
   - **Labour Payments** (SE RABs) → Release; multi-stage bills release as ONE payment with one cashbook entry.
   - **Petty Cash** (PM + SE).
   - **Bank Transfers**.
3. **Cheque Management** — 7 sub-tabs: All · Received · Opened · Awaiting CRE · Issued · Bounced · Disabled. Project Name auto-populated on every row (Feb 2026 backfill).
4. **Income** — funds received view; reconcile by client.
5. **Suspense Ledger** — auto-credit when cheque > bill, auto-apply on next payment to same contractor.
6. **Bank Reconciliation** — match cashbook against bank statement.
7. **Reject + route back** with notes (notifies originator).
8. **Petty Cash Issuance dialog** — pick method (cash / cheque / current / savings) + reference.

### Multi-Mode Payment Release
The Labour RAB release supports a mix:
- Cash from suspense balance
- Cheque (pick an issued cheque)
- Bank transfer (current / savings) with reference

All combine into a single cashbook entry with `payment_entries[]` so reconciliation knows the exact split.

---

## 5. Project Manager

**Home**: `/pm-dashboard`.

### Functions
1. **All Projects** — KPI strip (Total · In Planning · In Construction · Completed) + searchable indigo table. Row click → SE workspace.
2. **Change Stage** — Yet to Start → Sub-structure → Super-structure → Finishing → Handover.
3. **Assign Team** — drag SE / Sr.SE / Associate-PMs onto a project.
4. **Petty Cash sub-tabs**: PM Petty Cash (own) · Approve SE Petty Cash · Issued history.
5. **Material Request approval** — step 1 of material PO ladder.
6. **Labour RAB approval** — step 1 of labour ladder.
7. **Approve Mark Work Complete** — closes a stage on Planning side.
8. **Notifications inbox**.

---

## 6. Site Engineer / Sr. SE / Associate-PM

**Home**: `/site-engineer` (or PM's workspace for higher roles).

### Functions
1. **Projects picker** — assignments-driven (SE only sees assigned).
2. **Work Orders board** per contractor — 5 sub-tabs:
   - **Payment Schedule** — status pills: All Stages · Open Stage · Completed · Locked Stages.
   - **Additional** — 4 buckets: Claimable / Non-Claimable / Rework-SE / Rework-Client. Each section expandable (chevron) to show line items + per-item Lock status.
   - **Additional RAB** — history scoped to is_addition stages.
   - **Total RAB's** — history excluding additional stages.
   - **DLR** — Daily Labour Report entry.
3. **Request RAB dialog**:
   - KPI strip (Total · Balance · Released · Extra · In Pipeline).
   - Multi-stage allocation list scoped by claim_type group (Regular / Claimable / Non-Claimable / Rework-SE / Rework-Client).
   - Per-section expand → per-item Pick checkbox.
   - Auto-distribute amount across selected stages.
   - From Date (auto from opened_at) / To Date (manual).
   - Notes (visible to PM/QC/Planning).
4. **Edit pending RAB** — same dialog in edit mode, title shows "Edit RAB-XX · <Stage>".
5. **Mark Work Complete** — initiates stage closure ladder.
6. **Material Request** — quantity, urgency, attached drawings.
7. **Material Receipt** — quantity received, condition.
8. **Petty Cash request** — purpose, amount, justification.
9. **DLR entry** — date, workers (regular/skilled), hours, attendance.

### Permissions Delta
- **Sr. SE / Associate-PM**: All SE functions + Submit/Delete RABs (elevated), Bulk DLR.
- **PM**: All Sr. SE functions + Stage Change + Team Assign + Approval queues.

---

## 7. Planning / Planning-Person

**Home**: Planning workspace + Project Detail editor.

### Functions
1. **Project Detail editor** — full read/write per WO.
2. **Scope CRUD**: Add (single-row dialog) · Edit · Delete; auto-recompute scope_total.
3. **Stage CRUD**: Add (Fixed or % of Contract) · Edit · Delete; refuses delete if stage has RABs.
4. **Section CRUD** (Additional): Add · Edit · Delete; 4 buckets selectable.
5. **Section Lock/Unlock** — cascades to items.
6. **Item Lock/Unlock** — gated on section being unlocked.
7. **RAB approval** — step 3 (after PM + QC).
8. **Reject + send back** with notes.
9. **Freeze WO** — locks the contract; only Super Admin can unfreeze.

### Planning Person
- Same as Planning but scoped to projects assigned by Planning Head.

---

## 8. Procurement

**Home**: Procurement Board.

### Functions
1. **All Projects table** — material aggregator across active projects.
2. **Material Vendors** — Vendor view · Materials view.
3. **Material Stock** — receipts vs consumption ledger with date filter.
4. **Vendor Book** per vendor — Orders · Credits · Summary tabs.
5. **Material Edit Popup** — Details · Vendors split.
6. **Multi-Mode Payment Release**.
7. **Raise PO** → routes to Accountant.
8. **Pending order count** column on Projects > Materials > Vendors.

---

## 9. Vendor

**Home**: `/vendor-portal`.

### Functions
1. View their POs.
2. Confirm + dispatch.
3. Upload invoice copy.
4. View payment status (Pending · Released · Bounced).

---

## 10. Client (Client Portal)

**Home**: `/client-portal/{projectId}` (auto-redirected for single-project clients).

### Functions
1. **Project dashboard** — Header (project name · contract · status), KPI cards (Paid · Pending · Next visit).
2. **Payment Schedule** — every stage with status badge.
3. **Approve / Reject** Claimable Additional charges with note.
4. **Cashflow** — money in vs out; auto-hides Non-Claimable + Rework-SE rows.
5. **Site Visits** — scheduled, confirmed, past.
6. **Documents** — contract, invoices, completion certificate.
7. **In-app notifications**.
8. **Back arrow** — only when client has multiple projects.

---

## 11. Pre-Sales / Sales / Marketing Head

### Pre-Sales
1. CRM Lead inbox (auto-distributed via configured rules + solo-mode fallback).
2. First-contact log + notes.
3. Convert qualified → push to Sales.

### Sales
1. Pipeline (New · Quoted · Negotiation · Won · Lost).
2. Slot Management — show slot beside user's name (Phase 2).
3. Convert Won → push to CRE.
4. Bulk-reassign (Phase 2 backlog).

### Marketing Head
1. Lead-source analytics, campaign ROI.
2. Edit distribution rules + weighting.
3. Manage public package gallery + filter chips (Phase 2 backlog).

---

## 12. Architect / Super Architect

### Architect
1. Upload design package per project.
2. Version control on drawings.
3. Tag drawings to specific stages.

### Super Architect
- All Architect functions + Approve revisions before Planning sees them.

---

## 13. HR

1. Attendance grid (Phase 2 — unification of CL/SL/manual punch).
2. Leave approvals.
3. Manual punch adjustments.
4. Payroll generation (Phase 2 — depends on unified attendance).

---

## 14. Quality Check (QC)

**Home**: QC Inbox.

### Functions
1. **RAB QC approval** — step 2 of labour ladder (after PM).
2. Site visit reports (planned vs done).
3. **Reject with rework reason** — auto-creates a Rework (SE) additional item linked to the rejected RAB.

---

## 15. Prospect (Mobile-first)

1. View shared quote (no login required for shared link).
2. Browse public package gallery.
3. Trigger callback request.

---

## Cross-Role Notes

| Concern | Where it lives |
|---------|---------------|
| Notifications | Right drawer; backed by `db.notifications` |
| Search | Top-bar global search (super admin) + per-table search (every role) |
| Mobile | Fully responsive; prospect = mobile-first |
| Theming | Indigo primary; orange map markers; violet for Planning ; emerald for Released |
| Data freshness | Hot-reload on edit; manual refresh via toast actions |

_End of role manual._
