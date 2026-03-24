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

### 2. HR Admin Module (NEW - March 2026)
- **Employee Database**: Full employee directory with search/filter by department
- **Daily Attendance Calendar**: Monthly grid view with per-day status marking (P/PL/SL/CL/WFH/Halfday/A)
- **GPS Check-in/Check-out**: Employee self-service with location capture
- **Late Tracking**: Auto-calculate late minutes based on configurable department timings
- **Leave Management**: Employee apply + HR approve/reject flow with PL/SL/CL/WFH types
- **Auto Salary Calculation**: Computes gross, deductions (LOP/Loan/Late), net pay from attendance
- **Digital Payslips**: Professional payslip view with company header, earnings/deductions breakdown
- **HR Settings**: Configurable department timings (start/end/grace), annual leave limits, company info

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

## Key Data Models
- `hr_settings`: Department timings, leave limits, company info
- `attendance`: Daily check-in/out with GPS, late tracking
- `leave_requests`: Leave applications with approval workflow
- `payroll_v2`: Monthly salary calculations
- `staff`: Employee profiles with extended fields

## API Routes
- `/api/hr/` - HR Admin module (hr.py)
- `/api/crm/` - CRM & Sales (crm.py)
- `/api/operations/` - Operations (operations.py)
- `/api/financial/` - Financial (financial.py)
- `/api/projects/` - Projects (projects.py)
- `/api/reports/api-endpoints-pdf` - Secured PDF report

## Security
- Cookie-based auth (httponly, secure, samesite)
- Role-based access control (RBAC)
- NoSQL injection prevention
- Rate limiting (100 req/min)
- CSRF protection
- Security headers (HSTS, CSP, X-Frame-Options)
- **PRODUCTION TODO**: Disable demo-login, move rate limiting to MongoDB

## Completed Features
- [x] Automated Project Onboarding Pipeline
- [x] CRE-Style Convert to Project Popup
- [x] Sales Follow-up System
- [x] Site Visit Management
- [x] API Report (PDF, secured)
- [x] Security Audit
- [x] HR Admin Module (Dashboard, Attendance, Leave, Payroll, Payslips, Settings)

## Upcoming Tasks (P1)
- Sr. Engineer to Jr. Engineer Assignment
- Two-Factor Authentication (2FA)
- Refactor CRMSales.jsx (2000+ lines)
- Refactor ProjectDetail.jsx (4000+ lines)
- Aadhar Document Upload

## Backlog (P2)
- Cash Denomination feature
- Comprehensive UI/UX review
- SaaS model conversion
- Production deployment guidance
