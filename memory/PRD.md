# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API, Resend, Emergent Object Storage, Leaflet/OpenStreetMap

## Core Modules

### 1. CRM Pipeline (Marketing -> Pre-Sales -> Sales)
- Lead management with 13 pipeline stages
- Google Sheets auto-import (5-min auto-sync)

### 2. Project Management
- CRE deal conversion with auto-cheque creation
- Project approval workflow: CRE Submit → Planning Review → GM Approve → Final Approve
- BOQ/Material catalog management
- Construction stage tracking (Foundation → Plinth → Superstructure → ...)

### 3. Work Orders
- Material work orders with vendor assignment
- Labour work orders with multi-stage lifecycle
- Stage-based payment workflow: Start → Complete → Request Payment → Planning Approve → Accountant Process

### 4. Material Request & Procurement
- SE requests materials → Planning approves → Procurement assigns vendor → Accountant approves advance → Mark in-transit
- OTP-based material receipt verification with GPS tracking

### 5. Accountant Module (3-tab layout, Accountant-only access)
- **Cashbook Tab**: Financial Overview (9 clickable payment mode cards), Expense Category Breakdown (6 clickable cards)
- **Cheque Management Tab**: Full CRUD, auto-created incoming cheques from deal conversion
- **Project Summary Tab**: Clickable project rows → project detail with Payment Summary
- **Petty Cash Management**: Drilldown from expense category card, view/issue/settle SE petty cash

### 6. Site Engineer Module
- Project assignments, work order management
- **Mini Cashbook**: Per-project petty cash income/expense tracking
- **Petty Cash**: Request, record expenses, submit for settlement
- Material receipts with OTP verification

### 7. Smart Cheque Payment System
- Pay expenses using outgoing cheques, excess → vendor suspense
- Auto-detect vendor suspense balance

## Key API Endpoints
- CRM: `POST /api/crm/leads`, `PATCH /api/crm/leads/{id}/stage`
- CRE: `POST /api/cre/convert-deal/{lead_id}` (with auto-cheque)
- Planning: `PATCH /api/planning/projects/{id}/submit-for-approval`, `PATCH /api/planning/projects/{id}/update-stage`
- Approvals: `PATCH /api/approvals/projects/{id}/gm-approve`, `PATCH /api/approvals/projects/{id}/final-approve`
- Work Orders: `POST /api/work-orders/material`, `POST /api/work-orders/labour`, `PATCH /api/work-orders/{id}/stages/{stage_id}/{action}`
- Material Requests: `POST /api/site-engineer/material-requests`, `PATCH /api/site-engineer/material-requests/{id}/approve?action=...`
- Material Receipts: `POST /api/site-engineer/material-receipts/initiate`, `POST /api/site-engineer/material-receipts/verify-otp`
- Petty Cash: `POST /api/site-engineer/petty-cash/request`, `PATCH /api/accountant/petty-cash/{id}/issue`, `POST /api/site-engineer/petty-cash/{id}/submit`, `PATCH /api/accountant/petty-cash/{id}/settle`
- Mini Cashbook: `GET /api/site-engineer/mini-cashbook`
- Petty Cash Mgmt: `GET /api/accountant/petty-cash-management`, `GET /api/accountant/petty-cash/{user_id}/mini-cashbook`
- Accountant: `GET /api/accountant/cashbook-filtered`, `POST /api/accountant/record-expense`, `GET /api/accountant/cheques`

## Credentials
- All users: password `Demo@1234`
- Super Admin: `admin@constructionos.com`
- Accountant: `accountant@constructionos.com`
- GM: `gm@constructionos.com`
- Planning: `planning@constructionos.com`
- CRE: `cre@constructionos.com`
- Site Engineer: `engineer@constructionos.com`
- Procurement: `procurement@constructionos.com`

## E2E Test Data (Mar 9, 2026)
- Lead: Mr. Vinothkumar babu (lead_978e3cf17f84, deal_closed)
- Project: Villa Vinothkumar - Coimbatore (proj_6f33e023cc5f, status: planning_approved, stage: foundation)
- Cheques: CHQ001 ₹300K + CHQ002 ₹200K (HDFC Bank, incoming, issued)
- Work Orders: WO-0001 (cement), WO-0002 (steel), WO-0003 (labour, 2/3 stages paid)
- Material Requests: mreq_e6f8939a5f7c (cement, received_completed), mreq_c13d7419e567 (steel, received_completed)
- Petty Cash: pc_29ba99b65611 (settled, ₹25K), pc_425e29780351 (issued, ₹15K, 1 expense)
- Financials: Income ₹5L, Expenses ₹93K, Net ₹4.07L

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync
- [x] CRE deal conversion with auto-cheque creation
- [x] Project approval workflow (CRE → Planning → GM → Final)
- [x] Material BOQ/catalog management
- [x] Work order creation and stage-based payment lifecycle
- [x] Material request & procurement workflow
- [x] OTP-based material receipt verification
- [x] Site Engineer Mini Cashbook
- [x] Petty cash management (request, issue, expense, settle)
- [x] Accountant Cashbook with clickable drilldowns
- [x] Cheque Management with Smart Payment
- [x] Project Summary with payment details
- [x] Role-based access control
- [x] Full E2E lifecycle test - 100% pass (Mar 9, 2026)

## Bug Fixes Applied (Mar 9, 2026)
- Fixed: vendor lookup changed from db.vendors to db.vendor_master in site_ops.py
- Fixed: Added resend import and SENDER_EMAIL constant in site_ops.py
- Fixed: Material receipt status check expanded to include 'in_transit' and 'order_placed'
- Fixed: Duplicate WorkOrder model in core/models.py renamed to BOQWorkOrder
- Fixed: Duplicate /accountant/petty-cash/{id}/issue route consolidated (body JSON instead of query param)
- Fixed: _id leak in CRE new deals endpoint

## Known Limitations
- Project-level expenses use `expenses` collection while accountant cashbook uses `recorded_expenses` (separate data stores)
- Rate limiter may block rapid sequential login attempts during automated testing

## Backlog
- [ ] Gantt Chart for project timelines
- [ ] Aadhar Document Upload with encrypted storage
- [ ] UI/UX review continuation
- [ ] Production deployment
- [ ] MarketingBoard.jsx refactoring (2500+ lines)
- [ ] Unify expenses/recorded_expenses collections for project-level expense view
