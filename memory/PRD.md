# Construction CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive Construction CRM/ERP system with automated project onboarding, sales pipeline management, and operational workflows for a construction company.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI + MongoDB Atlas
- **Auth**: Cookie-based session auth with role-based access control (RBAC)
- **Roles**: super_admin, sales, pre_sales, cre, planning, project_manager, site_engineer, sr_site_engineer, accountant

## What's Been Implemented

### Sales Pipeline (CRMSales.jsx)
- 16-stage Kanban board with drag-and-drop
- Follow-up management, Site Visit management
- Automated onboarding pipeline with CRE-style Convert dialog

### Project Management (ProjectDetail.jsx)
- Full project lifecycle: Estimates, Materials, Labours, Work Orders, Payments, Documents, Summary
- 4-Level Payment Approval Pipeline, Freeze & Reassign
- DLR (Daily Labour Report), Google Maps URL Location Setup

### Site Engineer View (SiteEngineerDashboard.jsx)
- 7 tabs: Projects, Site Visits, Work Orders, Petty Cash, Cashbook, Curing Video, Attendance
- **Petty Cash (REVAMPED)**: Multi-level approval flow:
  - SE requests → PM approves → Accountant processes payment (with bank/cheque details) → SE acknowledges
  - Summary cards: Cash in Hand, Expenses, Pending Requests, Waiting Approval
  - 3 sub-tabs: Payment Request Status (with status timeline), Income History, Expense Record (with date/project filters)
- **Record Expense**: Direct expense recording (no approval), multi-line items with category selector (Electrical, Plumbing, Painting, Civil, Wooden, Miscellaneous + custom), bill upload via Object Storage
- **Curing Video Management**: Global button, popup, WhatsApp link, history tab
- **Inventory Management**: Opening/Closing stock with threshold alerts
- **Multi-Project GPS Attendance**: Login/logout with 5km geofencing

### Planning Board (PlanningBoard.jsx)
- Packages, Material Vendors, Labour Contractors, RE Templates, Live Map
- Custom header navigation injected into AppHeader

### PM Dashboard (PMDashboard.jsx)
- All Projects, Requests, **Petty Cash (NEW)**, Team tabs
- **Petty Cash Approval**: Table with approve/reject buttons for SE requests

### Accounts Board (AccountsBoard.jsx)
- Income/Expense tracking, Suspense, Indirect Expenses
- **Petty Cash Management (UPDATED)**: PM-Approved requests section with "Process Payment" dialog (payment mode, bank, cheque no, reference, date, amount, remarks)

## Database Collections (Key)
- `petty_cash`: Updated status flow: requested → pm_approved → accountant_processing → payment_done → acknowledged
- `direct_expenses`: NEW - Direct expense records with line items and bill uploads
- `expense_categories`: NEW - Custom expense categories
- `curing_video_records`: Curing video status + WhatsApp tracking

## Key API Endpoints (New)
- Petty Cash Flow: POST `/api/site-engineer/petty-cash/request`, GET `/api/pm/petty-cash-requests`, PATCH `/api/pm/petty-cash/{id}/approve`, PATCH `/api/pm/petty-cash/{id}/reject`, PATCH `/api/accountant/petty-cash/{id}/process-payment`, PATCH `/api/site-engineer/petty-cash/{id}/acknowledge`
- Summary/History: GET `/api/site-engineer/petty-cash/summary`, GET `/api/site-engineer/petty-cash/income-history`
- Direct Expenses: POST `/api/site-engineer/direct-expense`, GET `/api/site-engineer/direct-expenses`
- Categories: GET `/api/expense-categories`, POST `/api/expense-categories`
- Curing Video: POST/GET/PATCH `/api/site-engineer/curing-video/...`

## Completed Tasks (Latest Session - Apr 2026)
- [x] AppHeader custom navigation for Planning Board - Tested iteration_130
- [x] Curing Video Management - Tested iteration_131
- [x] Dialog viewport overflow fix - Tested iteration_132
- [x] **Petty Cash Multi-Level Approval System** - Tested iteration_133 (17/17 backend, 100% frontend)
  - SE → PM → Accountant → SE acknowledge flow
  - Record Expense with categories & bill upload
  - PM Dashboard approval tab
  - Accountant payment processing dialog

## Prioritized Backlog

### P0 (Critical)
- Refactor ProjectDetail.jsx (~5400 lines) into components
- Refactor PlanningBoard.jsx (~1900 lines) into components

### P1 (High Priority)
- Pre-Deployment Security: 2FA, rate limiting, disable demo-login
- Refactor SiteEngineerDashboard.jsx (~2000+ lines)

### P2 (Medium Priority)
- Sr. Engineer → Jr. Engineer Assignment Workflow
- Aadhar Document Upload (encrypted storage)
- Cash Denomination feature (paused)
- SaaS model conversion (paused)
- Comprehensive UI/UX review

## Credentials
- Demo Access buttons on login page for all roles
- Accountant: accountant@constructionos.com / USB@123.26
