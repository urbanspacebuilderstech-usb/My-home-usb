# MyHomeUSB CRM — API & Data Model Reference

_Backend surface area (FastAPI) + MongoDB schema._

---

## 1. Routers Overview

| Router | Path prefix | Purpose |
|--------|------------|---------|
| `auth.py` | `/api/auth` | Login, register, JWT issue, password reset |
| `crm.py` | `/api/crm` | Leads, pipeline, distribution rules |
| `projects.py` | `/api/projects` | Master projects, WOs, stages, additional work, RAB lifecycle (12,000+ lines) |
| `financial.py` | `/api/accountant` + `/api/cre` | Cashbook, approvals, cheques, income, suspense |
| `operations.py` | `/api/accountant/cheques` etc. | Cheque Management 7 tabs, vendor book |
| `site_ops.py` | `/api/site-engineer`, `/api/procurement-simple` | SE board API, material/labour requests, petty cash |
| `procurement.py` | `/api/procurement` | Procurement-side dashboards, vendor book |
| `client_portal.py` | `/api/client-portal` | Client-only API |
| `public.py` | `/api/public` | Public lead form, package gallery |
| `hr.py` | `/api/hr` | Attendance, leave, payroll (Phase 2) |

All routes are JWT-authenticated except `/api/auth/login` and `/api/public/*`.

---

## 2. Key Endpoints by Module

### 2.1 Authentication
- `POST /api/auth/login` — body: `{email, password}` → `{token, user}`.
- `POST /api/auth/register` — admin-only.
- `GET /api/auth/me` — current user profile.

### 2.2 Projects (subset)
- `GET /api/projects` — list (role-scoped).
- `POST /api/projects` — create (CRE).
- `GET /api/projects/{id}` — detail.
- `PATCH /api/projects/{id}/status` — advance status (with role gating).
- `GET /api/projects/{id}/work-orders` — list WOs.
- `POST /api/projects/{id}/work-orders` — create WO.
- `GET /api/projects/{id}/payment-stages` — client-side payment ladder.

### 2.3 Work Order Scope (Feb 2026)
- `POST /api/projects/{pid}/work-orders/{wid}/scope-items` — add scope line.
- `DELETE /api/projects/{pid}/work-orders/{wid}/scope-items/{idx}` — delete line.
- `POST /api/projects/{pid}/work-orders/{wid}/stages` — add stage (fixed / percentage).
- `DELETE /api/projects/{pid}/work-orders/{wid}/stages/{sid}` — delete stage (refuses if RABs exist).

### 2.4 RAB lifecycle
- `POST /api/projects/{pid}/work-orders/{wid}/stages/{sid}/payment-requests` — raise RAB.
- `POST /api/projects/{pid}/work-orders/{wid}/multi-stage-payment-requests` — multi-stage RAB.
- `PATCH /api/projects/{pid}/work-orders/{wid}/stages/{sid}/payment-requests/{rid}` — edit pending RAB (amount, notes, target_stage_id).
- `POST /api/projects/{pid}/work-orders/{wid}/stages/{sid}/payment-requests/{rid}/pm-approve` — PM step.
- `…/qc-approve` — QC step.
- `…/planning-approve` — Planning step.
- `POST /api/accountant/labour-payments/{rid}/release` — Accountant release. Body supports `sibling_request_ids[]` for multi-stage atomic release + `payment_entries[]` for multi-mode.
- `GET /api/accountant/labour-rab/{rid}/pay-context` — pre-release context (siblings, suspense balance).

### 2.5 Additional Work
- `POST /api/projects/{pid}/work-orders/{wid}/additional/sections` — create section.
- `DELETE /api/projects/{pid}/work-orders/{wid}/additional/sections/{sid}` — delete section.
- `PATCH /api/projects/{pid}/work-orders/{wid}/addition-sections/{sid}/lock` — lock/unlock section (cascades to items + section stage).
- `POST /api/projects/{pid}/work-orders/{wid}/additional` — add item.
- `PATCH /api/projects/{pid}/work-orders/{wid}/additional/{idx}` — edit item.
- `DELETE /api/projects/{pid}/work-orders/{wid}/additional/{idx}` — delete item.
- `PATCH /api/projects/{pid}/work-orders/{wid}/additional/{idx}/lock` — per-item lock (gated on section being unlocked).

### 2.6 Cheques
- `GET /api/accountant/cheques?status=…` — list (with project_name backfill).
- `POST /api/cre/cheques` — CRE submits.
- `POST /api/accountant/cheques/{id}/open` — Accountant opens.
- `PATCH /api/accountant/cheques/{id}/issue` — issue to vendor.
- `PATCH /api/accountant/cheques/{id}/bounce` — mark bounced.

### 2.7 Site Engineer
- `GET /api/site-engineer/project/{pid}` — SE/PM/Super Admin view of a project.
- `POST /api/site-engineer/material-requests`.
- `POST /api/site-engineer/labour-payments`.
- `POST /api/site-engineer/petty-cash`.

### 2.8 Client Portal
- `GET /api/client-portal/my-projects`.
- `GET /api/client-portal/projects/{id}/dashboard`.
- `POST /api/client-portal/additional-costs/{cid}/approve` / `/reject`.

---

## 3. MongoDB Collections (selected fields)

### `users`
```json
{
  "user_id": "usr_abc",
  "email": "anbu@my.com",
  "name": "Anbu",
  "role": "site_engineer",
  "phone": "...",
  "is_active": true,
  "password_hash": "bcrypt$2b$..",
  "slot_id": "slot_morning",
  "created_at": "ISO",
  "metadata": {…}
}
```

### `projects`
```json
{
  "project_id": "proj_xxx",
  "project_number": "P-2026-001",
  "name": "anbu",
  "client_id": "client_abc",
  "client_name": "Anbu",
  "location": "...",
  "latitude": 11.1, "longitude": 77.0,
  "status": "active",
  "current_stage": "sub_structure",
  "team": [{"user_id":"…","role":"…","name":"…"}],
  "contract_value": 5000000,
  "created_at": "..."
}
```

### `project_work_orders`
```json
{
  "work_order_id": "wo_xxx",
  "project_id": "proj_xxx",
  "contractor_id": "cont_abc",
  "contractor_name": "Alli muthu",
  "contractor_type": "Civil",
  "status": "active",
  "scope_items": [{"name":"…","unit":"sqft","quantity":100,"unit_rate":50,"total":5000}],
  "scope_total": 5000,
  "additional_sections": [{"section_id":"sec_xxx","name":"anbu Demo Section","claim_type":"rework_se","is_locked":false}],
  "additional_work": [{"description":"…","unit":"nos","quantity":1,"unit_rate":500,"total":500,"section_id":"sec_xxx","claim_type":"rework_se","is_locked":false}],
  "additional_total": 500,
  "deduction_total": 0,
  "total_value": 5500,
  "stages": [{
    "stage_id":"stg_xxx",
    "stage_label":"S1",
    "name":"Foundation Completion",
    "amount":1000,
    "scheduled_amount":1000,
    "is_open": true,
    "is_addition": false,
    "claim_type": null,
    "linked_section_id": null,
    "payment_requests": [{
      "request_id":"req_xxx",
      "rab_number":"RAB-01",
      "rab_group_id":"grp_xxx",
      "amount":1000,
      "approved_amount":1000,
      "status":"approved",
      "is_multi_stage": false,
      "stage_breakdown": [],
      "pm_approved_by_name":"…",
      "qc_approved_by_name":"…",
      "planning_approved_by_name":"…",
      "payment_record": {…},
      "notes":"…",
      "timeline": [{"step":"requested","at":"..."}]
    }],
    "amount_released": 1000,
    "amount_pending": 0
  }],
  "paid_amount": 1000
}
```

### `cheques`
```json
{
  "cheque_id":"chq_xxx",
  "cheque_no":"123456",
  "amount":50000,
  "cheque_date":"2026-01-15",
  "bank":"HDFC",
  "drawer_name":"…",
  "project_id":"proj_xxx",
  "project_name":"anbu",
  "status":"received | opened | awaiting_cre | issued | bounced | disabled",
  "purpose":"income | issued_payment",
  "linked_request_id":"req_xxx",
  "linked_contractor_id":"…",
  "received_by":"usr_cre",
  "received_at":"…",
  "metadata": {…}
}
```

### `cashbook`
```json
{
  "expense_id":"exp_xxx",
  "project_id":"proj_xxx",
  "project_name":"anbu",
  "category":"labour | material | petty_cash | income",
  "amount": 1000,
  "approved_amount": 1000,
  "payment_method":"cash | cheque | bank",
  "cheque_no":"…",
  "bank_ref":"…",
  "contractor_id":"…",
  "stage_id":"stg_xxx",
  "stage_name":"Foundation",
  "is_multi_stage_bill": false,
  "rab_group_id":"grp_xxx",
  "linked_request_ids":["req_xxx"],
  "stage_breakdown":[{"stage_id":"…","stage_name":"…","amount":1000,"request_id":"…"}],
  "status":"approved",
  "source":"wo_stage_release",
  "payment_entries":[{"method":"cheque","amount":1000,"bank_ref":"","cheque_ids":["chq_xxx"]}],
  "payment_date":"…",
  "created_at":"…"
}
```

### `payment_stages` (CRE client-side ladder)
```json
{
  "stage_id":"pst_xxx",
  "project_id":"proj_xxx",
  "stage_no":1,
  "stage_name":"Booking Advance",
  "scheduled_amount":250000,
  "due_date":"…",
  "linked_section_id": null,
  "status":"requested | received | approved | rejected",
  "payment_record": {…},
  "source":"manual | additional"
}
```

### `notifications`
```json
{
  "notification_id":"ntf_xxx",
  "user_id":"usr_xxx",
  "type":"rab_pm_approved",
  "title":"RAB-02 awaiting QC",
  "body":"…",
  "link":"/projects/proj_xxx",
  "is_read": false,
  "created_at":"…"
}
```

---

## 4. Authentication Header

Every authenticated request sends:
```
Authorization: Bearer <JWT>
```

JWT body: `{user_id, role, name, email, exp}`.

---

## 5. Response Envelopes

Successful responses return the payload directly (no `data` envelope).
Errors return:
```json
{ "detail": "Human-readable error message" }
```
HTTP codes used: 200 (OK) · 400 (validation) · 403 (forbidden by role) · 404 (not found) · 409 (state conflict).

---

## 6. Pagination & Filtering Conventions

- Most list endpoints accept `limit` (default 100-500) + optional filters as query params.
- Date filters use ISO strings (`start_date=2026-01-01&end_date=2026-02-01`).
- Status filters accept comma-separated lists where supported.

---

## 7. ID Conventions

| Entity | Prefix |
|--------|--------|
| User | `usr_` |
| Project | `proj_` |
| Work Order | `wo_` |
| Stage | `stg_` |
| Payment Request | `req_` |
| Section | `sec_` |
| Cheque | `chq_` |
| Cashbook | `exp_` |
| RAB Group | `grp_` |
| Notification | `ntf_` |

All IDs are 12-character hex (`uuid4().hex[:12]`).

_End of API reference._
