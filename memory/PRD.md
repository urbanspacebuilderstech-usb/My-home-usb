# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, HR management, and package-based estimation.

## Core Modules

### 1. CRM & Sales Pipeline
- Automated multi-stage onboarding pipeline
- Follow-up system with date filtering (ascending sort, date range)
- Follow-up stage intercept: Date picker shown when moving leads
- Date filter applies to ALL stages. Defaults to today, supports date range
- Site visit management with ascending date sort
- Sr. to Jr. Engineer Assignment
- RE Revision Flow: Duplicate-based (RE0→RE1→RE2), GM lock
- Auto-notifications on project onboarding

### 2. Pre-Sales Board
- **RNR Auto-Redistribution**: Leads in RNR stage for 14+ days (from creation) auto-move to "New RNR Leads" stage
- **Round-Robin Distribution**: Stale RNR leads split among all pre-sales team members
- Appointment Booked card in top stats
- Date filter for ALL stages (from-to range, Today, Clear)
- Ascending sort by date across all stages

### 3. HR Admin Module (7 Tabs)
- Dashboard, Employees (CRUD), Roles & Credentials
- Attendance Calendar, Leave Management, Payroll, Settings

### 4. Package Management
- Packages, Materials, Brands, Rough Estimates, Drag-and-Drop

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] Sales Follow-up with date intercept, ascending sort, date range
- [x] Site Visit Management with date sort & filtering
- [x] Pre-Sales Appointment Booked card
- [x] Pre-Sales date filter for all stages
- [x] **RNR Auto-Redistribution (14 days, round-robin)**
- [x] **New RNR Leads stage with redistribution badge**
- [x] HR Admin Module (7 tabs)
- [x] Package Management
- [x] Sr. to Jr. Engineer Assignment
- [x] RE Revision Duplication Flow
- [x] RE Lock after GM Approval
- [x] Auto-Notification on Project Onboarding

## Upcoming Tasks (P1)
- Project page: Select package → populate materials & estimates, drag-and-drop
- Refactor CRMSales.jsx (2000+ lines) and ProjectDetail.jsx (4000+ lines)

## Backlog (P2)
- 2FA (Google Authenticator) - at deployment
- Aadhar Document Upload
- Cash Denomination, UI/UX review, SaaS conversion
- PRODUCTION: Disable demo-login, MongoDB rate limiting
