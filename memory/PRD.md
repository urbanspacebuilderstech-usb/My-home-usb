# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, HR management, and package-based estimation.

## Core Modules

### 1. CRM & Sales Pipeline
- Automated multi-stage onboarding pipeline
- Follow-up system with date filtering
- Site visit management (Client Land & Our Projects)
- **Sr. → Jr. Engineer Assignment** (NEW): Sr. Engineers assign Jr. Engineers from Site Visits tab, Jr. Engineers mark visits done

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
- `/api/crm/jr-engineers` - Get Jr. Engineers (site_engineer + planning roles)
- `/api/crm/leads/{id}/assign-jr-engineer` - Sr. assigns Jr. Engineer
- `/api/crm/leads/{id}/complete-site-visit` - Jr/Sr marks visit done
- `/api/crm/my-site-visits` - Engineer's assigned visits with jr info
- `/api/packages/`, `/api/brands`, `/api/rough-estimates`
- `/api/hr/` - HR module

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] Sales Follow-up System, Site Visit Management
- [x] HR Admin Module (7 tabs)
- [x] Package Management with Materials, Brands, Rough Estimates
- [x] Sr. → Jr. Engineer Assignment workflow
- [x] Security Audit, API Report PDF

## Upcoming Tasks (P1)
- Project page: Select package -> populate materials & estimates
- Drag & reorder for Scopes, Payment Stages, Labours (app-wide)
- Refactor CRMSales.jsx (2000+ lines)
- Refactor ProjectDetail.jsx (4000+ lines)

## Backlog (P2)
- 2FA (Google Authenticator) - at deployment
- Aadhar Document Upload
- Cash Denomination, UI/UX review, SaaS conversion
- PRODUCTION: Disable demo-login, MongoDB rate limiting
