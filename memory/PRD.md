# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end — from lead generation through project execution to financial accounting.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API (OAuth 2.0), Resend (email), Emergent Object Storage, Leaflet/OpenStreetMap

## Core Modules

### 1. CRM Pipeline (Marketing → Pre-Sales → Sales)
- Lead management with stage progression
- Google Sheets auto-import (Zapier-style integration, 5-min auto-sync)
- Round-robin lead assignment

### 2. Project Management
- Project creation and lifecycle management
- Work orders, site operations, procurement
- Planning board

### 3. Accountant Module (REFACTORED - March 2026)
Three-tab layout within `/accounts-board`:
- **Dashboard Tab**: Financial Overview (9 payment modes), Expense Category Breakdown (Material, Labour, Petty Cash, Suspense, Other), Project-wise Summary
- **Cashbook Tab**: Date range filters (from/to/project), Income table (auto-sourced from pipeline), Expense table with category filters, Inline Add Expense
- **Cheque Management Tab**: Full CRUD for incoming/outgoing cheques, status tracking (Issued → Deposited → Cleared/Bounced/Cancelled), Smart Payment feature, Vendor Suspense Accounts

### 4. Smart Cheque Payment System
- Pay expenses using outgoing cheques
- Excess cheque amount → automatically credited to vendor suspense
- Auto-detect vendor suspense balance on future payments (automatic popup)
- Suspense balance deduction before cheque usage

### 5. HR Portal
- Staff management, attendance, payroll

### 6. Role-Based Access
- Super Admin, Accountant, General Manager, Sales Manager, CRE, Site Engineer, Marketing

## Key API Endpoints
### Accountant
- `GET /api/accountant/overview` - Financial overview
- `GET /api/accountant/cashbook-filtered` - Filtered cashbook with date range
- `POST /api/accountant/record-expense` - Record manual expense
- `GET /api/accountant/cheques` - List all cheques
- `POST /api/accountant/cheques` - Add new cheque
- `PATCH /api/accountant/cheques/{id}/status` - Update cheque status
- `GET /api/accountant/cheques/reminders` - Post-dated cheque reminders
- `POST /api/accountant/cheque-payment` - Smart payment via cheque
- `GET /api/accountant/uncleared-cheques` - Available cheques for payment
- `GET /api/accountant/vendor-suspense/{name}` - Vendor suspense balance
- `GET /api/accountant/all-vendor-suspense` - All vendor suspense balances

## Database Collections
- `projects`, `leads`, `income`, `recorded_expenses`, `labour_expenses`, `material_requests`
- `cheques` (cheque_id, cheque_number, bank_name, amount, status, cheque_type, party_name, project_id)
- `cheque_suspense` (entry_id, vendor_name, amount, description, payment_id, cheque_id)
- `google_sheets_config`, `audit_logs`, `users`

## Credentials
- All users: password `Demo@1234`
- Accountant: `accountant@constructionos.com`
- Super Admin: `super_admin@constructionos.com`

## What's Implemented (as of March 2026)
- [x] Full CRM pipeline (Marketing → Pre-Sales → Sales)
- [x] Google Sheets integration with auto-sync
- [x] Project management with work orders
- [x] Accountant Dashboard (3-tab layout)
- [x] Cashbook with date range filters
- [x] Cheque Management with full CRUD
- [x] Smart Cheque Payment with vendor suspense
- [x] Role-based access and navigation
- [x] Inline expense entry
- [x] E2E testing passed 100%

## Backlog
- [ ] Gantt Chart for project timelines
- [ ] Aadhar Document Upload with encrypted storage
- [ ] Screen-by-screen UI/UX review continuation
- [ ] Production deployment guidance
- [ ] MarketingBoard.jsx refactoring (2500+ lines → smaller components)
