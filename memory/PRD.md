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
- [x] **Accountant responsive design** with fixed header, sticky tabs, fixed bottom nav (Mar 9, 2026)
- [x] Full E2E lifecycle test - 100% pass (Mar 9, 2026)

## Responsive Design (Accountant Board) - Mar 9, 2026
- Fixed header (AppHeader sticky top-0 z-50)
- Sticky tab bar (Cash/Cheques/Projects) below header with short mobile labels
- Fixed bottom navigation (Dashboard/Approvals/HR/More) via MobileBottomNav
- Financial Overview: 3-col mobile → 5-col tablet → 9-col desktop
- Expense categories: 3-col mobile → 6-col desktop
- Petty Cash summary: 2-col mobile → 4-col desktop
- SE Cashbook summary: 3-col always
- All tables: overflow-x-auto for horizontal scroll on mobile
- Date filters: vertical stack on mobile, inline on desktop
- Cheque management: responsive filter buttons, search, action buttons

## Credentials
- All users: password `Demo@1234`
- Super Admin: `admin@constructionos.com`
- Accountant: `accountant@constructionos.com`
- GM: `gm@constructionos.com`
- Planning: `planning@constructionos.com`
- CRE: `cre@constructionos.com`
- Site Engineer: `engineer@constructionos.com`
- Procurement: `procurement@constructionos.com`

## Backlog
- [ ] Gantt Chart for project timelines
- [ ] Aadhar Document Upload with encrypted storage
- [ ] UI/UX review continuation (other pages responsive)
- [ ] Production deployment
- [ ] MarketingBoard.jsx refactoring (2500+ lines)
- [ ] Unify expenses/recorded_expenses collections for project-level expense view
