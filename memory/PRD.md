# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, HR management, and package-based estimation.

## Core Modules

### 1. CRM & Sales Pipeline
- Automated multi-stage onboarding pipeline
- Follow-up system with date filtering (ascending sort, date range support)
- **Follow-up stage intercept**: Date picker shown when moving leads to Follow-up
- **Date filter**: Applies to Follow-up AND Site Visit stages. Defaults to today, supports date range
- Site visit management (Client Land & Our Projects) with ascending date sort
- Sr. to Jr. Engineer Assignment
- RE Revision Flow: Duplicate-based (RE0→RE1→RE2), GM lock, Sales revision request
- Auto-notifications on project onboarding

### 2. Pre-Sales Board
- **Appointment Booked card**: Added to top stats with green styling and count
- Lead management with Kanban and List views

### 3. HR Admin Module (7 Tabs)
- Dashboard, Employees (full CRUD), Roles & Credentials
- Attendance Calendar, Leave Management, Payroll, Settings

### 4. Package Management
- Packages (2x2 grid, max 4): Code, Name, Tag, Rate, Description
- Materials with Brand dropdown, Scope, Labour
- Lock/Duplicate packages, Rough Estimates (G+1/G+2/G+3)

### 5. Financial, Project, Operations Modules
- Existing modules with full functionality

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] Sales Follow-up System with date intercept, ascending sort, date range filter
- [x] Site Visit Management with ascending date sort & date filtering
- [x] Pre-Sales Appointment Booked card
- [x] HR Admin Module (7 tabs)
- [x] Package Management with Materials, Brands, Rough Estimates
- [x] Sr. to Jr. Engineer Assignment workflow
- [x] RE Revision Duplication Flow (RE0→RE1→RE2)
- [x] RE Lock after GM Approval
- [x] Auto-Notification on Project Onboarding

## Upcoming Tasks (P1)
- Project page: Select package → populate materials & estimates, drag-and-drop reorder
- Refactor CRMSales.jsx (2000+ lines)
- Refactor ProjectDetail.jsx (4000+ lines)

## Backlog (P2)
- 2FA (Google Authenticator) - at deployment
- Aadhar Document Upload
- Cash Denomination, UI/UX review, SaaS conversion
- PRODUCTION: Disable demo-login, MongoDB rate limiting
