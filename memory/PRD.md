# My Home USB - Construction Management System PRD

## Original Problem Statement
Build a comprehensive labour and materials management system for a Construction OS platform. The system manages projects, site engineers, material procurement, work orders, and daily progress tracking.

## Core Requirements
- Multi-role authentication (Super Admin, Site Engineer, Procurement, Planning, Accountant, HR, etc.)
- Project management with assignments
- Material procurement workflow (request -> approval -> order -> transit -> receive)
- Work order management with contractor-centric flow
- Stock management and daily stock counts
- Daily progress reporting
- Google Sheets integration for data sync
- Email notifications via Resend
- HR Portal with separate Employee profiles and User account creation

## Completed Features

### Pre-existing (before March 2026)
- Full authentication system with demo access
- Project CRUD with multi-role access
- Site Engineer assignment and project views
- Material request workflow (SE -> Planning -> Procurement -> Transit)
- Procurement Board with 7 tabs
- Contractor management and work order creation
- Google Sheets auto-sync
- Email notifications via Resend
- Object Storage for file uploads
- Leaflet/OpenStreetMap integration

### March 2026 Session 1
- Procurement Board Data Seeding
- Site Engineer Order Detail Popup
- Work Orders Tab Rework (contractor-centric)

### March 2026 Session 2
- Phase 1: Enhanced Material Request Flow (approved materials with brands)
- Phase 2: Material Receiving & Stock Management (image uploads, GPS)
- Phase 3: Daily Progress Reports

### March 2026 Session 3
- **Daily Stock Count Report**: Auto-populated inventory table with received materials, opening/closing stock, totals, check-in log
- **User Account Creation (Roles & Credentials tab)**:
  - "Create User" button with form: Link Employee, Name, Email, Password, Confirm Password, Role
  - Super Admin can create/edit/delete any user including HR
  - HR can create users (except super_admin/hr roles) but cannot edit/delete
  - No email onboarding - direct password-based creation
  - Delete user capability for Super Admin
  - Login with email/password for created users
- **Test data cleanup**: Removed 4 TEST_John Doe HR Test records

### March 2026 Session 4
- **Super Admin Setup Wizard**: `/setup` page for first-time Super Admin creation
- **Percentage-Based Payment Stages**: Stages use % of total project value; amounts auto-calculated on backend; hidden from PM role
- **Password Visibility Toggle**: Eye icon on all password fields
- **Demo Login CORS Fix**: Fixed CORS config blocking demo logins
- **Global Dialog Z-Index Fix**: Modified `dialog.jsx` with `overflow: visible` to prevent dropdown clipping

### March 2026 Session 5 (Current)
- **Bug Fix - Rough Estimate Dialog (3 bugs)**:
  1. **Unit dropdown stuck**: Moved `overflow-y-auto` from `DialogContent` to inner wrapper div so UnitSelect dropdown renders above dialog
  2. **Decimal input blocked**: Removed premature `parseFloat` from Qty/Rate onChange handlers; parseFloat now only applied during total calculation and save
  3. **Dropdown clipped by dialog**: Same root cause as #1 — inner scroll wrapper pattern applied
- **Feature - GM Can Edit RE Projects**:
  - Added `general_manager` to edit permissions (backend + frontend)
  - Full RE edit dialog in GMDashboard with scope items, unit select, decimal inputs
  - Change log system: tracks field-level changes (old → new) with user name, role, timestamp
  - Edit History UI shown to both GM and Planning in their respective edit dialogs
  - New API: `GET /api/crm/re-projects/{id}/change-logs`
  - New MongoDB collection: `re_change_logs`
- **Feature - RE Estimate Number (USB-RE0001)**:
  - Auto-incrementing sequential RE numbers (USB-RE0001, USB-RE0002, ...)
  - Searchable across Planning, Sales, and GM dashboards
  - Search endpoint: `GET /api/crm/re-projects/search?q=...`
  - Revisions endpoint: `GET /api/crm/re-projects/by-number/{re_number}`
  - New MongoDB collection: `counters` (for auto-increment)
- **Feature - RE Revision System (RE0, RE1, RE2...)**:
  - Full client workflow: Planning → GM → Sales sends to client → Client feedback/approve
  - New statuses: `sent_to_client`, `client_feedback`, `client_approved`
  - New APIs: `send-to-client`, `client-feedback`, `client-approve`, `create-revision`
  - Revision copies all data from previous version, carries client feedback context
  - Visual: client-approved = green border, others with approved sibling = low opacity
  - Only client-approved RE can convert to project via Deal Closed
  - Client Feedback popup in Sales with notes textarea
  - "Create Revision" button in Planning for RE with client feedback

## Architecture
```
/app/
├── backend/
│   ├── server.py
│   ├── core/ (models, storage, notifications)
│   ├── routes/
│   │   ├── auth.py        # Authentication
│   │   ├── projects.py    # Projects
│   │   ├── site_ops.py    # SE operations, daily progress, approved materials
│   │   ├── procurement.py # Procurement board
│   │   ├── contractors.py # Work orders
│   │   ├── operations.py  # Planning, HR staff CRUD, user creation/deletion
│   │   ├── financial.py   # Finance, approvals
│   │   └── files.py       # File upload
│   └── seed_*.py
└── frontend/src/
    ├── pages/
    │   ├── SiteEngineerProject.jsx  # Materials, Work Orders, Stock, Progress tabs
    │   ├── HRPortal.jsx             # Employee Profiles, Roles & Credentials
    │   ├── ProjectDetail.jsx        # Admin project view (needs refactoring)
    │   └── ...
    └── components/
```

## Key API Endpoints
- `POST /api/hr/users/create` - Create user (email/password/role)
- `DELETE /api/hr/users/{user_id}` - Delete user (Super Admin only)
- `GET /api/projects/{project_id}/approved-materials` - Branded materials
- `POST /api/projects/{project_id}/daily-progress` - Log daily progress
- `GET /api/projects/{project_id}/received-stock` - Received materials

## Prioritized Backlog

### P1
- Two-Factor Authentication (2FA) with mobile OTP
- Advanced Cybersecurity Practices
- Aadhar Document Upload with encrypted storage
- Refactor ProjectDetail.jsx (4000+ lines)

### P2
- Cash Denomination feature (paused)
- Comprehensive UI/UX review
- Convert to SaaS model
- Production deployment guidance

## Test Credentials
- Demo Access buttons on login page
- Super Admin: admin@constructionos.com
- HR: hr@constructionos.com
- Site Engineer: engineer@constructionos.com
- Test Project: proj_12f23331b542 (Mr. Vinoth Kumar Babu)
