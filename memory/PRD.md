# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API, Resend, Emergent Object Storage, Leaflet/OpenStreetMap

## Core Modules

### 1. CRM Pipeline (Marketing -> Pre-Sales -> Sales)
- Lead management, Google Sheets auto-import (5-min auto-sync)

### 2. Project Management
- Project creation, work orders, site operations, procurement

### 3. Accountant Module (3-tab layout, Accountant-only access)
- **Cashbook Tab**: Financial Overview (9 clickable payment mode cards with drilldown), Expense Category Breakdown (6 clickable cards), Date range filters, Income/Expense tables, Inline Add Expense
- **Cheque Management Tab**: Full CRUD, status tracking, Smart Payment with vendor suspense
- **Project Summary Tab**: Clickable project rows -> navigate to project detail with Payment Summary

### 4. Payment Summary (Project Detail Page)
- **Income/Expense sub-tabs**: Mini views showing project income and expense entries
- **Role-based visibility**:
  - Super Admin & Accountant: See Total Income/Expense/Net Balance cards + table footer totals
  - GM & Planning: See income/expense tables (individual entries) but NOT totals
  - Other roles: No income/expense section visible
- Stage-wise Payment Schedule, Collection Progress

### 5. Clickable Card Drilldowns (Cashbook)
- Click payment mode cards -> Income/Expense breakdown for that mode
- Click Suspense -> comprehensive vendor suspense account view
- Click expense categories -> filtered expense list

### 6. Smart Cheque Payment System
- Pay expenses using outgoing cheques, excess -> vendor suspense
- Auto-detect vendor suspense balance (automatic popup)

## Key API Endpoints
- `GET /api/accountant/overview`, `GET /api/accountant/cashbook-filtered`
- `POST /api/accountant/record-expense`, `POST /api/accountant/cheque-payment`
- `GET /api/accountant/cheques` (CRUD), `GET /api/accountant/uncleared-cheques`
- `GET /api/accountant/vendor-suspense/{name}`, `GET /api/accountant/all-vendor-suspense`
- `GET /api/projects/{id}/income`, `GET /api/projects/{id}/expenses`
- `GET /api/projects/{id}/payment-summary`

## Credentials
- All users: password `Demo@1234`
- Accountant: `accountant@constructionos.com`
- Super Admin: `admin@constructionos.com`
- GM: `gm@constructionos.com`
- Planning: `planning@constructionos.com`

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync
- [x] Project management with work orders
- [x] Accountant Cashbook with clickable drilldowns
- [x] Cheque Management with Smart Payment
- [x] Project Summary with clickable navigation
- [x] Payment Summary with Income/Expense sub-tabs (role-based)
- [x] Role-based access (Accountant-only Accounts Board)
- [x] E2E testing passed 100%

## Backlog
- [ ] Gantt Chart for project timelines
- [ ] Aadhar Document Upload with encrypted storage
- [ ] UI/UX review continuation
- [ ] Production deployment
- [ ] MarketingBoard.jsx refactoring (2500+ lines)
