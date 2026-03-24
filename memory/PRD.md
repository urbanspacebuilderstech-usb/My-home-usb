# My Home USB - Product Requirements Document

## Original Problem Statement
Construction CRM application with automated sales pipeline, project onboarding, and HR management.

## Core Modules

### 1. CRM & Sales Pipeline
- Automated multi-stage onboarding pipeline
- Follow-up system with date filtering
- Site visit management (Client Land & Our Projects)
- CRE-style "Convert to Project" popup
- Lead management with Kanban board

### 2. HR Admin Module (March 2026)
**7 Tabs - Complete HR Management System:**
- **Dashboard**: Active Employees, Total Users, Present/Late Today, Pending Leaves, Monthly Budget, Department Strength
- **Employees**: Full CRUD with multi-section form (Personal, Employment, Documents, Address, Salary & Bank), View/Edit/Terminate, Document Upload
- **Roles & Credentials**: Create User (link to employee), Edit Role, Reset Password, Delete User, Search/Filter by role
- **Attendance Calendar**: Monthly grid with click-to-mark (P/PL/SL/CL/WFH/Halfday/A), Late Report view
- **Leave Management**: Employee apply + HR approve/reject flow with PL(12)/SL(12)/CL(6)/WFH(24)
- **Payroll**: Auto salary calculation from attendance (Basic+HRA+PA+FA - LOP/Loan/Late = Net Pay)
- **Settings**: Company info, configurable department timings, annual leave limits

### 3. Financial Management
- Income/Expense tracking, Cashbook, Vendor management

### 4. Project Management
- BOQ, Payments, Scope management

### 5. Operations
- CRE Board, Planning, Work Orders, HR, Accounts

## Tech Stack
- Frontend: React + Shadcn/UI + Tailwind
- Backend: FastAPI + MongoDB Atlas
- Auth: Cookie-based sessions with bcrypt
- Storage: Emergent Object Storage
- Integrations: Google Sheets, Resend, Leaflet/OpenStreetMap, jsPDF

## Key API Routes
- `/api/hr/` - HR Admin module (hr.py) - Dashboard, Attendance, Leave, Payroll, Payslips, Settings
- `/api/hr/staff` - Staff CRUD (operations.py)
- `/api/hr/users` - User management (operations.py)
- `/api/crm/` - CRM & Sales
- `/api/operations/` - Operations
- `/api/financial/` - Financial
- `/api/projects/` - Projects

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] CRE-Style Convert to Project Popup
- [x] Sales Follow-up System
- [x] Site Visit Management
- [x] API Report (PDF, secured)
- [x] Security Audit
- [x] HR Admin - Complete 7-tab module with all old + new features merged

## Upcoming Tasks (P1)
- Sr. Engineer to Jr. Engineer Assignment
- Two-Factor Authentication (2FA)
- Refactor CRMSales.jsx (2000+ lines)
- Refactor ProjectDetail.jsx (4000+ lines)
- Aadhar Document Upload with encrypted storage

## Backlog (P2)
- Cash Denomination feature
- Comprehensive UI/UX review
- SaaS model conversion
- Production deployment guidance
- PRODUCTION: Disable demo-login, move rate limiting to MongoDB
