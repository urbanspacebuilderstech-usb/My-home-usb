# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end — from lead generation through project execution to financial accounting.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API (OAuth 2.0), Resend (email), Emergent Object Storage, Leaflet/OpenStreetMap

## Core Modules

### 1. CRM Pipeline (Marketing -> Pre-Sales -> Sales)
- Lead management with stage progression
- Google Sheets auto-import (Zapier-style integration, 5-min auto-sync)

### 2. Project Management
- Project creation and lifecycle management
- Work orders, site operations, procurement

### 3. Accountant Module (REFACTORED - March 2026)
Three-tab layout within `/accounts-board` (ACCOUNTANT ONLY):
- **Cashbook Tab**: Financial Overview (9 clickable payment mode cards with drilldown), Expense Category Breakdown (6 clickable cards), Date range filters, Income/Expense sub-tabs with tables, Inline Add Expense
- **Cheque Management Tab**: Full CRUD, status tracking, Smart Payment feature, Vendor Suspense Accounts
- **Project Summary Tab**: Summary cards (Income/Expense/Net), full project table with P&L%

### 4. Clickable Card Drilldowns
- Click any payment mode card (Cash, Current A/c, Cheque, etc.) -> shows Income/Expense breakdown for that mode
- Click Suspense A/c -> comprehensive suspense account with all vendor balances and transaction history
- Click expense categories (Material, Labour, etc.) -> filtered expense list for that category

### 5. Smart Cheque Payment System
- Pay expenses using outgoing cheques
- Excess cheque amount -> automatically credited to vendor suspense
- Auto-detect vendor suspense balance on future payments (automatic popup)

### 6. Role-Based Access
- Super Admin: NO access to Accounts Board (sees Finance/Financial Overview instead)
- Accountant: Exclusive access to Accounts Board with 3-tab layout
- Other roles: Respective dashboards

## Key API Endpoints
- `GET /api/accountant/overview` - Financial overview
- `GET /api/accountant/cashbook-filtered` - Filtered cashbook with date range
- `POST /api/accountant/record-expense` - Record manual expense
- `GET /api/accountant/cheques` - List all cheques
- `POST /api/accountant/cheques` - Add new cheque
- `PATCH /api/accountant/cheques/{id}/status` - Update cheque status
- `POST /api/accountant/cheque-payment` - Smart payment via cheque
- `GET /api/accountant/uncleared-cheques` - Available cheques for payment
- `GET /api/accountant/vendor-suspense/{name}` - Vendor suspense balance
- `GET /api/accountant/all-vendor-suspense` - All vendor suspense balances

## Credentials
- All users: password `Demo@1234`
- Accountant: `accountant@constructionos.com`
- Super Admin: `admin@constructionos.com`

## What's Implemented (as of March 2026)
- [x] Full CRM pipeline (Marketing -> Pre-Sales -> Sales)
- [x] Google Sheets integration with auto-sync
- [x] Project management with work orders
- [x] Accountant Cashbook with clickable drilldowns
- [x] Cheque Management with full CRUD
- [x] Smart Cheque Payment with vendor suspense
- [x] Project Summary tab with P&L%
- [x] Role-based access (Accountant-only Accounts Board)
- [x] E2E testing passed 100%

## Backlog
- [ ] Gantt Chart for project timelines
- [ ] Aadhar Document Upload with encrypted storage
- [ ] Screen-by-screen UI/UX review continuation
- [ ] Production deployment guidance
- [ ] MarketingBoard.jsx refactoring (2500+ lines)
