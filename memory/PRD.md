# Construction Accounting CRM & Project Operations OS - PRD

## Overview
A comprehensive Construction Accounting CRM & Project Operations OS titled "My Home USB" (Urban Space Builders). Replaces Excel, WhatsApp, and manual approvals with a single, project-centric, role-based system.

## Tech Stack
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React with TailwindCSS + Shadcn UI on port 3000
- **Database**: MongoDB
- **Authentication**: Custom JWT + Demo Login + Google OAuth (invited users only)

## User Roles
1. Super Admin, 2. General Manager, 3. CRE, 4. Accountant, 5. Project Manager, 6. Associate PM, 7. Sr. Site Engineer, 8. Planning, 9. Procurement, 10. Site Engineer, 11. Pre-Sales, 12. Sales, 13. Vendor, 14. Client

## Demo Credentials
- All demo users password: `Demo@1234`
- Super Admin: admin@constructionos.com
- Accountant: accountant@constructionos.com (Priya Sharma)
- GM: gm@constructionos.com
- PM: pm@constructionos.com
- Planning: planning@constructionos.com
- Procurement: procurement@constructionos.com
- Site Engineer: engineer@constructionos.com
- CRE: cre@constructionos.com
- Pre-Sales: presales@constructionos.com
- Sales: sales@constructionos.com
- Client: mohan@client.com

## What's Been Implemented (Complete)
- Full project management (CRUD, scope items, payment schedule, deductions, additions)
- BOQ, Work Orders, Approval Workflows
- CRM (Pre-Sales → Sales → RE Projects → Deal Close → CRE → Project)
- Procurement Board V2 with 8-step material flow
- Site Engineer + PM workflows (material/labour requests, petty cash)
- Accountant Module (cashbook, suspense account, smart payments, cheque mgmt, HR/payroll, payment processing)
- Finance Module (approvals, cashbook, suspense, project finance view)
- Client Portal with Share as PDF
- Vendor Portal
- Email notifications (Resend), File uploads (Emergent Object Storage)
- Maps (Leaflet/OpenStreetMap), Material Receipt OTP
- Mobile responsiveness + PWA
- Security hardening (CORS, RBAC, CSRF, DB indexes)
- Real auth (password login, forgot/reset, invitations)
- Server refactoring (16K line monolith → modular routes)
- Branding: "My Home USB" with charcoal/amber theme
- Role-specific UI: AppHeader.jsx + MobileBottomNav.jsx for all roles
- Super Admin dashboard with optimized API
- Accountant role-specific header and mobile nav (COMPLETED March 8, 2026)

## Recently Completed (March 8, 2026)
- **Accountant Role-Specific UI**: Fixed duplicate accountant entry bug in MobileBottomNav.jsx. Fixed "More" drawer rendering (was only for super_admin). Verified desktop header and mobile bottom nav with "More" drawer for accountant role.

## Pending Tasks

### P0 - End-to-End Flow Test
- Full workflow: Lead → Pre-Sales → Sales → CRE → Accountant Approval → Planning → Procurement/PM → Site Engineer → Final Finance
- Multi-role test creating data at each step

### P1 - Screen-by-Screen UI/UX Review
- User-guided review of all 50 application screens

### P2 - Future/Backlog
- Gantt Chart for project timelines
- Aadhar Document Upload with encrypted storage
- Database Security & Production Readiness
- Live deployment guidance
- Google Sheets Integration enhancements
- Unified Approval Dashboard for GM/Admin

## Architecture
```
/app/backend/
├── main.py (bootstrap, 67 lines)
├── core/ (database.py, models.py, deps.py)
├── routes/ (auth, projects, site_ops, financial, procurement, operations, crm)
├── security.py

/app/frontend/src/
├── components/
│   ├── AppHeader.jsx (role-aware sticky header)
│   └── MobileBottomNav.jsx (role-aware mobile bottom nav)
├── pages/ (~50 pages)
├── App.js (routes)
```

## 3rd Party Integrations
- MongoDB Atlas
- Resend (email)
- Emergent Object Storage (file uploads)
- Google Sheets API
- Leaflet/OpenStreetMap
