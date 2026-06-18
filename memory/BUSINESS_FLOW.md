# MyHomeUSB CRM — Business Flow & Approval Ladder

_Every workflow from lead to handover, with every approval step._

---

## 1. The Big Picture

```
PUBLIC ─► PRE-SALES ─► SALES ─► CRE ─► ACCOUNTANT(verify) ─► PLANNING ─► GM ─► SUPER ADMIN ─► PROJECT ACTIVE
                                                                                          │
              ┌───────────────────────────────────────────────────────────────────────────┘
              ▼
   Per Work Order: SE ─► PM ─► QC ─► PLANNING ─► ACCOUNTANT(release) ─► CASHBOOK OUT
   Per Material:   SE ─► PM ─►         PLANNING ─► ACCOUNTANT(release)
   Per Petty Cash: SE ─► PM ─►                     ACCOUNTANT(issue)
   Per Stage:      PM Marks Complete ─► PLANNING freezes ─► Stage closed
                                                                  │
                                                                  ▼
   PROJECT advances Sub-structure ─► Super-structure ─► Finishing ─► Handover ─► COMPLETED
```

---

## 2. Lead → Project (Pre-execution Phase)

### Step 1 — Lead capture
- **Public website form** → POST `/api/public/lead` → `db.leads` (status: `new`).

### Step 2 — Pre-Sales contact
- **Pre-Sales** user: opens lead, logs first contact, qualifies.
- API: `PATCH /api/crm/leads/{id}` → status `qualified`.
- Marketing Head's distribution rules auto-assign Pre-Sales user (round-robin / weighted / solo-mode).

### Step 3 — Sales quote
- **Sales** user: creates quote, negotiates.
- Status: `quoted` → `negotiation` → `won` / `lost`.
- On `won`: trigger `POST /api/crm/leads/{id}/convert` → creates `projects` record with status `draft`.

### Step 4 — CRE setup
- **CRE** opens project, sets `client_name`, contract value, payment_stages ladder.
- API: `POST /api/projects/{id}/payment-stages`.
- Status: `draft` → `pending_payment` after CRE submits.

### Step 5 — Accountant verifies first cheque
- **CRE** collects 1st cheque → `POST /api/cre/cheques` (attached photo, amount).
- **Accountant** opens Approvals > Income → reviews → Accept.
- API: `POST /api/accountant/income/{cheque_id}/accept` → cashbook IN entry + status `payment_verified`.

### Step 6 — Planning review
- **CRE** clicks "Submit to Planning" → status `planning_review`.
- **Planning** edits WOs, scope, stages.
- Submits for approval → status `awaiting_approval`.

### Step 7 — GM + Super Admin sign-off
- **GM** approves → status `gm_approved`.
- **Super Admin** approves → status `planning_approved`.
- Project becomes **ACTIVE**.

---

## 3. RAB (Labour Payment Request) — 5-step Approval Ladder

```
[SE]              [PM]               [QC]            [PLANNING]        [ACCOUNTANT]
  │                │                  │                  │                  │
  │ raise RAB      │                  │                  │                  │
  ├───────────────►│ pm_approved      │                  │                  │
  │                ├─────────────────►│ qc_approved      │                  │
  │                │                  ├─────────────────►│ planning_approved│
  │                │                  │                  ├─────────────────►│ approved
  │                │                  │                  │                  │   ↓
  │                │                  │                  │                  │  cashbook OUT
  ◄────────────────┴──────────────────┴──────────────────┴──────────────────┘
                   reject path: status set to <step>_rejected → SE edits → resubmit
```

### State transitions in `payment_request.status`
- `requested` → `pm_approved` → `qc_approved` → `planning_approved` → `approved` (Accountant release)
- Any step can reject: `pm_rejected`, `qc_rejected`, `planning_rejected`, `accountant_rejected`
- SE can edit while in `requested` OR any `*_rejected`.

### Single vs Multi-Stage Bill
- Single stage: `payment_request.amount` = stage amount.
- Multi-stage: `is_multi_stage = True`, `stage_breakdown = [{stage_id, request_id, amount}, …]`.
- Multi-stage bills are linked by `rab_group_id`.
- **Accountant Release for multi-stage**: ONE click releases the whole group atomically — all siblings marked approved, ONE cashbook entry (description = "Contractor - Stage1 + Stage2", `linked_request_ids[]`).

### RAB Numbering
- Per contractor, monotonic across regular + additional stages.
- Example: Total RAB's gives RAB-01, RAB-02; next Additional RAB starts at RAB-03.

---

## 4. Additional Work Flow

### Section Lock/Unlock — Planning
- Section is the parent gate; items are children.
- Section LOCKED → all items locked → section's auto-stage closed → SE can't bill.
- Section UNLOCKED → all items default to unlocked → section's auto-stage opens → SE can bill.
- Planning can re-lock individual items to exclude them from billing.

### Section ↔ Stage mapping
- Each section maps to ONE auto-stage in `wo.stages` with `linked_section_id` set.
- Stage `name` = section name (e.g., "anbu Demo Section").
- Stage `amount` = sum of UNLOCKED items in that section.
- Stage `is_open` mirrors `not section.is_locked`.

### 4 Sub-tabs (Feb 2026)
| Tab | claim_type | Behaviour |
|-----|-----------|-----------|
| Claimable From Client | `claimable` | Bills client; appears in Client Portal cashflow |
| Non-Claimable From Client | `non_claimable` | Company absorbs; hidden from Client Portal |
| Rework (Site Engineer) | `rework_se` (+ legacy `rework`) | Deducted from contractor's payment, NOT billed |
| Rework (Client) | `rework_client` | Billed to client AND paid to contractor |

### SE Item-Picking (Request RAB)
- Section header checkbox → auto-picks every unlocked item.
- Per-item Pick checkbox → fine-tune which items are billed.
- Allocation amount = sum of picked items' totals.

---

## 5. Material Request Flow

```
SE raises material request
  │  (POST /api/site-engineer/material-requests)
  ▼
PM approves (step 1)
  │
  ▼
Procurement creates PO (assigns vendor)
  │
  ▼
Planning approves (step 2)
  │
  ▼
Accountant releases payment (multi-mode supported)
  │
  ▼
Vendor dispatches → SE confirms receipt
```

---

## 6. Petty Cash Flow

```
SE requests   →   PM approves   →   Accountant issues (Cash / Cheque / Bank)
PM requests   →                     Accountant issues
```

---

## 7. Income (Cheque) Flow

```
CRE records cheque    →    Accountant verifies    →    Cashbook IN    →    Project Payment Stage marked Paid
  (Received tab)            (Approvals > Income)
```

### Cheque Management Tabs (Accountant)
| Tab | Meaning |
|-----|---------|
| All | Every cheque |
| Received | Just collected by CRE, awaiting verify |
| Opened | Accountant has opened the envelope |
| Awaiting CRE | Sent back to CRE for clarification |
| Issued | Used to pay a vendor / contractor |
| Bounced | Returned by bank |
| Disabled | Voided |

---

## 8. Stage Closure / Project Advancement

```
SE Marks Work Complete       →  PM Approves Stage Complete
   on a stage                       │
                                    ▼
                          Planning freezes the stage
                                    │
                                    ▼
                          PM bumps project stage:
                            Yet to Start → Sub-structure → Super-structure → Finishing → Handover
                                    │
                                    ▼
                          CRE completes handover certificate
                                    │
                                    ▼
                                COMPLETED
```

---

## 9. Cross-Cutting Money Flows

### Suspense Ledger
- Created when: a cheque pays more than the bill amount (excess credited to contractor).
- Applied on: next payment to the same contractor (Accountant ticks "Use suspense balance" in release dialog).
- Tracked in: `db.contractor_suspense_ledger`.

### Cashbook (Single Source of Truth)
- Every IN (income) and OUT (release/issue) flows here.
- Linked back via: `request_id`, `linked_request_ids[]` (multi-stage), `cheque_id`, `project_id`.
- Reversible by Super Admin only.

### Client Portal Cashflow Filter
- Income visible to client: all CRE-collected cheques.
- Outflow visible to client: Claimable + Rework-Client.
- Hidden: Non-Claimable + Rework-SE (internal).

---

## 10. Notifications Triggers

| Event | Notifies |
|-------|----------|
| New lead | Pre-Sales (per distribution rule) |
| Lead converted | CRE |
| Cheque received | Accountant |
| RAB raised | PM |
| RAB PM-approved | QC |
| RAB QC-approved | Planning |
| RAB Planning-approved | Accountant |
| RAB rejected (any step) | SE (originator) |
| Payment released | SE + PM + Cashbook viewers |
| Stage marked complete | PM |
| Project advanced | All team members + CRE + Client |
| Cheque bounced | Accountant + CRE + Super Admin |

_End of business flow doc._
