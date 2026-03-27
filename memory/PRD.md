# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, HR management, and package-based estimation.

## Core Modules

### 1. CRM & Sales Pipeline
- Automated multi-stage onboarding pipeline
- Follow-up system with date filtering
- Site visit management (Client Land & Our Projects)
- CRE-style "Convert to Project" popup

### 2. HR Admin Module (7 Tabs)
- Dashboard, Employees (full CRUD), Roles & Credentials
- Attendance Calendar (click-to-mark), Leave Management
- Payroll (auto salary calc), Settings (dept timings, leave limits)

### 3. Package Management (NEW - March 2026)
- **Packages**: Create/Edit/Lock/Duplicate packages (2x2 card grid, max 4)
  - Fields: Code, Name, Tag, Per Sq.ft Rate, Description
  - Sub-items: Materials (with Brand dropdown), Scope, Labour
- **Brands**: Inline creation, no approval needed (e.g., Zuari, Dalmia)
- **Rough Estimates**: Per package, per floor config (G+1/G+2/G+3)
  - Line items: S.No, Name, Unit, Amount, Qty, Total, Remarks
  - Multiple estimates per package per floor config
- **Lock & Duplicate**: Locked packages can only be duplicated (editable copy)
- **Drag & Reorder**: Material lists support drag-and-drop reordering

### 4. Financial Management
- Income/Expense tracking, Cashbook, Vendor management

### 5. Project Management
- BOQ, Payments, Scope management
- Package selection copies materials/estimates to project

### 6. Operations
- CRE Board, Planning, Work Orders

## Key API Routes
- `/api/packages/` - Package CRUD (procurement.py)
- `/api/packages/{id}/lock` - Lock package (packages.py)
- `/api/packages/{id}/duplicate` - Duplicate package (packages.py)
- `/api/brands` - Brand CRUD (packages.py)
- `/api/rough-estimates` - Rough estimate CRUD (packages.py)
- `/api/reorder/{type}/{id}` - Reorder items (packages.py)
- `/api/projects/{id}/apply-package` - Apply package to project (packages.py)
- `/api/hr/` - HR module (hr.py)
- `/api/crm/` - CRM & Sales (crm.py)

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] CRE-Style Convert to Project Popup
- [x] Sales Follow-up System
- [x] Site Visit Management
- [x] API Report (PDF, secured)
- [x] Security Audit
- [x] HR Admin Module (7 tabs, all old+new features)
- [x] Package Management with Materials, Brands, Rough Estimates
- [x] Drag & Reorder for material lists

## Upcoming Tasks (P1)
- Project page: Select package -> populate materials & estimates
- Sr. Engineer → Jr. Engineer Assignment
- Refactor CRMSales.jsx (2000+ lines)
- Refactor ProjectDetail.jsx (4000+ lines)
- Drag & reorder for Scopes, Payment Stages, Labours (app-wide)

## Backlog (P2)
- 2FA (Google Authenticator) - implement at deployment
- Aadhar Document Upload
- Cash Denomination feature
- UI/UX review, SaaS conversion
- PRODUCTION: Disable demo-login, move rate limiting to MongoDB
