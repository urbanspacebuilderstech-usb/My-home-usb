# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, HR management, and package-based estimation.

## Core Modules

### 1. CRM & Sales Pipeline
- Automated multi-stage onboarding pipeline
- Follow-up system with date filtering
- Site visit management (Client Land & Our Projects)
- Sr. → Jr. Engineer Assignment
- **RE Revision Flow** (NEW): Duplicate-based revisions (RE0→RE1→RE2), GM lock after approval, Sales can request revision, Planning creates duplicate
- **RE Revision Display** (NEW): All revisions visible in CRMSales dialog and ProjectDetail tab, approved highlighted, others dimmed
- **Auto-notifications** (NEW): Planning/CRE/Sales auto-notified on project onboarding

### 2. HR Admin Module (7 Tabs)
- Dashboard, Employees (full CRUD), Roles & Credentials
- Attendance Calendar, Leave Management, Payroll, Settings

### 3. Package Management
- Packages (2x2 grid, max 4): Code, Name, Tag, Rate, Description
- Materials with Brand dropdown, Scope, Labour
- Lock/Duplicate packages, Rough Estimates (G+1/G+2/G+3)

### 4. Financial, Project, Operations Modules
- Existing modules with full functionality

## Key API Routes
- `POST /api/crm/re-projects/{id}/request-revision` - Sales requests revision (NEW)
- `POST /api/crm/re-projects/{id}/create-revision` - Planning creates duplicate revision (UPDATED)
- `PATCH /api/crm/re-projects/{id}` - Locked after GM approval (UPDATED)
- `GET /api/crm/re-projects/by-number/{re_number}` - Get all revisions
- `POST /api/crm/leads/{id}/accountant-verify` - Auto-notifies Planning/CRE/Sales (UPDATED)
- `/api/crm/jr-engineers`, `/api/crm/leads/{id}/assign-jr-engineer`
- `/api/packages/`, `/api/brands`, `/api/rough-estimates`
- `/api/hr/` - HR module

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] Sales Follow-up System, Site Visit Management
- [x] HR Admin Module (7 tabs)
- [x] Package Management with Materials, Brands, Rough Estimates
- [x] Sr. → Jr. Engineer Assignment workflow
- [x] Security Audit, API Report PDF
- [x] RE Revision Duplication Flow (RE0→RE1→RE2)
- [x] RE Lock after GM Approval
- [x] RE Revision Tabs in CRMSales & ProjectDetail
- [x] Auto-Notification on Project Onboarding

## Upcoming Tasks (P1)
- Project page: Select package → populate materials & estimates
- Drag & reorder for Scopes, Payment Stages, Labours (app-wide)
- Refactor CRMSales.jsx (2000+ lines)
- Refactor ProjectDetail.jsx (4000+ lines)

## Backlog (P2)
- 2FA (Google Authenticator) - at deployment
- Aadhar Document Upload
- Cash Denomination, UI/UX review, SaaS conversion
- PRODUCTION: Disable demo-login, MongoDB rate limiting
