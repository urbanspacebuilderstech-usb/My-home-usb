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
- [x] Accountant responsive design (Mar 9, 2026)
- [x] Full E2E lifecycle test - 100% pass (Mar 9, 2026)
- [x] Income/Expense Approval System (Mar 9, 2026)
- [x] Super Admin auto-creation for urbanspacebuilderstech@gmail.com (Mar 9, 2026)
- [x] Forgot Password flow (Mar 9, 2026)
- [x] RNR Stage in Pre-Sales pipeline (Mar 9, 2026)
- [x] Pipeline Stage Management - CRUD for Pre-Sales & Sales stages (Mar 9, 2026)
- [x] Pre-Sales → Sales transfer fix (Mar 9, 2026)
- [x] CRE Payment Collection → Accountant Approval fix (Mar 9, 2026)
- [x] **Masked Financial Values** (Mar 9, 2026)
  - MaskedValue component using React Context (MaskContext)
  - **Super Admin**: All values always visible (no masking)
  - **Accountant**: All values masked as ₹*****, click to reveal for 10 seconds
  - Applied to: Overview cards, mode cards, expense categories, income table, expense table, project summary, approvals tab, cheque management, petty cash, SE cashbook, vendor suspense
- [x] Deal conversion advance creates income approval record (Mar 9, 2026)

## Credentials
- All demo users: password `Demo@1234`
- Super Admin: `admin@constructionos.com`
- Accountant: `accountant@constructionos.com`
- CRE: `cre@constructionos.com`
- Production Super Admin: `urbanspacebuilderstech@gmail.com` (use Forgot Password)

## Backlog
- [ ] Gantt Chart for project timelines (P1)
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review continuation (other pages responsive)
- [ ] Production deployment guidance
