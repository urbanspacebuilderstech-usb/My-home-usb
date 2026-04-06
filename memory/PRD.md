# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, HR management, and package-based estimation.

## Core Modules

### 1. CRM & Sales Pipeline (16 Stages)
1. New Appointment → 2. Follow-up (date+reason, ascending) → 3. Discussion (remarks popup) → 4. Site Visit → 5. Site Visit (Client Land) (Sr. Engineer popup) → 6. Site Visit (Our Projects) (project popup) → 7. Site Visit Done → 8. Rough Estimate Requested → 9. RE - From Planning (auto on GM approval) → 10. RE - To Client (remarks) → 11. Negotiation → 12. Deal Closed (remarks) → 13. Payment Collect (advance popup) → 14. Accountant Approval (locked) → 15. Project Onboarded (auto-move only) → 16. Lost (reason required)

- **Phone Masking**: Sales/Pre-Sales/CRE see full numbers; other roles see masked
- **RE Revision Flow**: Duplicate-based (RE0→RE1→RE2), GM lock, revision request
- **Auto-blocks**: Project Onboarded & RE-From Planning cannot be moved manually
- Date filter (from-to range) with ascending sort across ALL stages

### 2. Pre-Sales Board (7 Stages)
- New Lead → Contacted → RNR → **New RNR Leads** (auto 14-day redistribution) → Portfolio sent → Follow-up → Appointment Booked
- **RNR Auto-Redistribution**: Round-robin among all pre-sales team
- Date filter for ALL stages, Appointment Booked card

### 3. HR Admin Module (7 Tabs)
- Dashboard, Employees, Roles, Attendance, Leave, Payroll, Settings

### 4. Package Management
- Packages, Materials, Brands, Rough Estimates, Drag-and-Drop

## Completed Features
- [x] Complete 16-stage Sales pipeline with intercepts
- [x] Phone number masking for non-sales roles
- [x] Stage remarks (Discussion, Deal Closed, RE-To Client)
- [x] Lost stage with required reason
- [x] Auto-blocks (Project Onboarded, RE-From Planning)
- [x] RE revision duplication, GM lock, auto-notifications
- [x] Pre-Sales RNR auto-redistribution (14-day, round-robin)
- [x] Date filter (range) + ascending sort for all stages
- [x] HR Admin, Package Management, Site Visit workflow
- [x] Bug fix: Remarks dialog opens on top of Lead Detail (race condition fix) - 2026-03-28
- [x] Accessibility: Added DialogDescription to Lead Detail dialog - 2026-03-28
- [x] Edit Lead dialog now shows ALL fields (Source, Pincode, Custom Fields) matching Add New Lead - both Pre-Sales & Sales - 2026-04-06
- [x] RE Templates CRUD in Planning Board (Create, Edit, Delete, List with scope items) - 2026-04-06

## Upcoming Tasks (P1)
- CRE Board: New projects on onboard → move to Planning
- Project page: Select package → populate materials
- Refactor CRMSales.jsx & ProjectDetail.jsx

## Backlog (P2)
- 2FA (Google Auth) at deployment
- Aadhar Document Upload
- Disable demo-login, MongoDB rate limiting
