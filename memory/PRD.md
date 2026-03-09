# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API, Resend, Emergent Object Storage, Leaflet/OpenStreetMap

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync
- [x] CRE deal conversion with auto-cheque creation
- [x] Project approval workflow (CRE -> Planning -> GM -> Final)
- [x] Work order creation and stage-based payment lifecycle
- [x] Material request & procurement workflow
- [x] OTP-based material receipt verification
- [x] Site Engineer Mini Cashbook
- [x] Petty cash management (request, issue, expense, settle)
- [x] Accountant Cashbook with clickable drilldowns
- [x] Cheque Management with Smart Payment
- [x] Project Summary with payment details
- [x] Role-based access control
- [x] Accountant responsive design with fixed header, sticky tabs, fixed bottom nav (Mar 9, 2026)
- [x] Full E2E lifecycle test - 100% pass (Mar 9, 2026)
- [x] **Income/Expense Approval System** (Mar 9, 2026)
  - ApprovalsTab in AccountsBoard with summary cards & sub-tabs (Income, Material, Labour, Supplier)
  - Source column in expense table (Manual vs Approval badges)
  - Backend approval endpoints (GET /api/approvals/unified, POST approve/reject)
- [x] **Super Admin auto-creation** for urbanspacebuilderstech@gmail.com (Mar 9, 2026)
- [x] **Forgot Password flow** fully functional for password creation (Mar 9, 2026)
- [x] AccountsBoard accessible by both Accountant and Super Admin roles

## Credentials
- All demo users: password `Demo@1234`
- Super Admin: `admin@constructionos.com`
- Accountant: `accountant@constructionos.com`
- GM: `gm@constructionos.com`
- Planning: `planning@constructionos.com`
- CRE: `cre@constructionos.com`
- Site Engineer: `engineer@constructionos.com`
- Procurement: `procurement@constructionos.com`
- Production Super Admin: `urbanspacebuilderstech@gmail.com` (use Forgot Password to set password)

## Key API Endpoints
- `GET /api/approvals/unified` - All pending approvals
- `POST /api/approvals/income/{id}/approve` - Approve income
- `POST /api/approvals/income/{id}/reject` - Reject income
- `PATCH /api/expenses/{type}/{id}/{action}` - Approve/reject expenses
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Set new password

## Backlog
- [ ] Gantt Chart for project timelines (P1)
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review continuation (other pages responsive)
- [ ] Production deployment guidance
- [ ] MarketingBoard.jsx refactoring (2500+ lines)
- [ ] Unify expenses/recorded_expenses collections for project-level expense view
