# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API, Resend, Emergent Object Storage, Leaflet/OpenStreetMap

## Roles
| Role | Dashboard Route | Key Capabilities |
|------|----------------|-------------------|
| Super Admin | /dashboard | Full access |
| General Manager | /gm-dashboard | Approvals (RE, projects, payments, design) |
| CRE | /cre-board | Deals, payments, collections |
| Accountant | /accounts-board | Finance, cheques, cashbook |
| Project Manager | /pm-dashboard | Projects (no financials), team, requests |
| Planning | /planning-board | Materials, labour, vendors |
| Procurement | /procurement-board-v2 | Purchase orders |
| Site Engineer | /site-engineer | On-site ops, mini cashbook |
| Pre-Sales | /crm-pre-sales | CRM pipeline |
| Sales | /crm-sales | Sales pipeline |
| Architect | /architect-dashboard | Site plans, 3D/elevation, design workflow |
| HR | /hr-portal | Employee profiles, roles & credentials |
| Client | /client-portal | View project status |

## Financial Model (80/20 Rule)
- Each project: **80% Direct Costs** (Materials, Labour, Site) / **20% Indirect + Profit**
- Indirect expenses auto-distribute across active projects based on value %
- When a project's 20% budget is exhausted, excess redistributes to other projects
- Profit = whatever remains in the 20% bucket after indirect expenses

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync (1-min interval)
- [x] Pre-Sales -> Sales transfer, RNR Stage + Pipeline Stage Management
- [x] Deal conversion, project creation, work orders
- [x] Material request/procurement/approval workflow
- [x] Site Engineer Mini Cashbook + Petty Cash
- [x] Accountant Cashbook, Cheque Management, Project Summary
- [x] Income/Expense Approval System
- [x] Masked Financial Values, Super Admin auto-creation
- [x] Forgot Password + Role-based access control
- [x] Production-Ready Setup Wizard (SetupWizard.jsx)
- [x] Architect Dashboard & Design Workflow
- [x] Gantt Chart for Project Timelines
- [x] PM Dashboard - Team, Materials, Labours Tabs
- [x] Google Sheets Sync Fix (auto-discover new tabs, 1-min interval)
- [x] Dynamic browser tab title (Role | My Home USB)
- [x] Auto-refresh (15s polling) across all 30+ pages — no reload needed
- [x] Loading spinner fix — only on initial load, not during refreshes
- [x] Safe error handling for 132 toast error catches (prevents React crashes)
- [x] CRE Board visibility fix (sees all projects, not just own)
- [x] Planning Board visibility fix (added missing status filters)
- [x] **Indirect Cost Management Module (Mar 17, 2026)**:
  - Budget Overview: 80/20 split per project with portfolio totals
  - Distribution Preview: Shows per-project allocation before submitting
  - Auto-Distribution: On payment confirmation, costs auto-split by project value %
  - Smart Balance: Exhausted projects get skipped, excess goes to others
  - Allocations History: Full audit trail of distributions
  - Access: Accountant + Super Admin create, GM/Super Admin approve
- [x] **Indirect Cost Management Visibility Fix (Mar 17, 2026)**:
  - Added "Indirect Costs" nav item to Accountant's main nav bar
  - Added "Indirect Costs" to Super Admin's Finance sub-menu
  - Fixed Finance sub-nav conflict (Financial Overview was duplicated in GM sub-menu)
- [x] **Indirect Expenses Integrated into Accounts Board (Mar 17, 2026)**:
  - Split Cashbook expense tab into 3 sub-tabs: Income, Direct Expense, Indirect
  - Indirect tab embeds full indirect cost management (expenses, budget overview, allocations)
  - Create/Approve/Confirm workflows available inline via dialogs
  - No separate page needed — all data accessible from Accounts Board
- [x] **Configurable Direct/Indirect Cost Split (Mar 17, 2026)**:
  - Super Admin can configure the indirect cost % via Settings and inline in Accounts Board
  - Visual Cost Split bar in Accountant's Indirect tab (read-only, shows "Set by Admin")
  - Super Admin gets Edit button to change % inline with save/cancel
  - All budget calculations and UI labels dynamically reflect the configured percentage
- [x] **Rough Estimates Tab in Planning Board (Mar 18, 2026)**:
  - Moved RE Projects from separate nav link into Planning Board as "Rough Estimates" tab
  - Red badge with count shows new requests on the tab title
  - Embeds existing REProjectsPage component with full RE workflow
- [x] **Multi-Mode Payment Collection (Mar 18, 2026)**:
  - CRE can collect advance/stage payments using multiple payment modes (Cash + Cheque + Bank Transfer + UPI)
  - Each entry: amount + mode + reference; cheque mode supports multiple cheque details
  - Running total with "Balanced" indicator when entries match total
  - Applied to both Convert Deal (advance) and Collect Payment dialogs
  - Backend creates separate income records per payment entry
- [x] **Numeric Input Formatting (Mar 18, 2026)**:
  - Removed spinner arrows from all 125 numeric inputs across 38 files
  - Auto Indian comma separator (1,00,000) on all amount/number fields
  - Only numeric entry allowed (blocks letters/symbols)
  - Created reusable NumericInput component
- [x] **Cheque Payment Review Bug Fix (Mar 18, 2026)**:
  - Fixed "Failed to review" error when Accountant tries to approve cheque payments
  - Root cause: Backend IncomeReviewRequest used Dict[str, str] for cheque_verifications but frontend sent amount as number → 422 Pydantic validation error
  - Fix: Changed backend to Dict[str, Any]; frontend now stringifies amount; validation allows approval without cheque records
  - Also fixed operations.py: cheque records now linked to income records via income_id during deal conversion
- [x] **PM Dashboard Team Assignment Enhancement (Mar 18, 2026)**:
  - Reworked Assign popup with TWO separate dropdowns: Sr. Site Engineer and Site Engineer
  - Each dropdown shows names with total project count for workload visibility
  - Multiple members of each role can be assigned per project
  - Currently assigned members visible in dialog with inline remove (X) button
  - Team column in All Projects table shows role-specific badges (Sr.SE / SE) with counts
- [x] **Project Detail Team Tab - Editable (Mar 18, 2026)**:
  - PM, Super Admin, and Planning roles can now edit team from within Project Detail
  - "Edit Team" button opens assignment dialog with Sr SE and SE dropdowns
  - Remove (X) button on each team member for quick removal
  - New backend endpoint: DELETE /api/pm/projects/{project_id}/team/{user_id}
- [x] **Removed "Generate Payment Schedule" Button (Mar 18, 2026)**:
  - Removed the "Generate Payment Schedule" button and handler from ProjectDetail - manual raise request flow is sufficient
- [x] **Planning Payment Schedule Overview Tab (Mar 18, 2026)**:
  - Added "Payment Schedule" tab to Planning Board with comprehensive overview of ALL payment stages across ALL projects
  - Summary cards: Total Scheduled, Collected, Pending Balance, Collection %
  - Table: Date, Project, Stage (%), Amount, Received, Balance, Status - sorted by date
  - Clickable rows navigate directly to the project detail page
  - Search functionality to filter by project/stage name
  - New backend: GET /api/planning/payment-schedule-overview

- [x] **HR Portal & Employee Management (Mar 18, 2026)**:
  - Two-tab HR Portal: Employee Profiles | Roles & Credentials
  - Employee Profiles: Full employee directory with search, department filter, add/edit/view/terminate
  - Comprehensive employee form with accordion sections: Personal Info, Employment Details, ID & Documents, Address & Emergency Contact, Salary & Bank Details
  - Document upload support (Photo, Resume, Aadhar, PAN) via Object Storage
  - Real-time salary calculation (Gross, Deductions, Net) in the form
  - Roles & Credentials tab: View all 29 users with roles, status, linked employee records
  - Super Admin can edit user roles, reset passwords, toggle active status
  - HR role can view/create/edit employees but cannot change roles or passwords
  - New HR user added to demo login: hr@constructionos.com
  - Backend: 8 new endpoints for employee profiles, document upload, user management
  - Optimized /hr/users endpoint with batch query instead of N+1

## Credentials
- Super Admin: `admin@constructionos.com` / `Demo@1234`
- GM: `gm@constructionos.com` / `Demo@1234`
- CRE: `cre@constructionos.com` / `Demo@1234`
- Accountant: `accountant@constructionos.com` / `Demo@1234`
- PM: `pm@constructionos.com` / `Demo@1234`
- Planning: `planning@constructionos.com` / `Demo@1234`
- Procurement: `procurement@constructionos.com` / `Demo@1234`
- Site Engineer: `engineer@constructionos.com` / `Demo@1234`
- Pre-Sales: `presales@constructionos.com` / `Demo@1234`
- Sales: `sales@constructionos.com` / `Demo@1234`
- Architect: `architect@constructionos.com` / `Demo@1234`
- HR: `hr@constructionos.com` / `Demo@1234`
- Client: `raj@client.com` / `Demo@1234`
- Client: `mohan@client.com` / `Demo@1234`

## Key API Endpoints - Indirect Cost Module
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/financial/project-budget-overview | All projects with 80/20 budget split |
| GET | /api/financial/indirect-cost-distribution-preview?amount=X | Preview auto-distribution |
| GET | /api/financial/indirect-cost-allocations | Distribution history |
| POST | /api/financial/indirect-costs | Create indirect cost (pending approval) |
| PATCH | /api/financial/indirect-costs/{id}/approve | Approve/reject |
| PATCH | /api/financial/indirect-costs/{id}/confirm | Confirm payment + auto-distribute |

- [x] **Monthly Payment Schedule System (Mar 19, 2026)**:
  - Planning creates monthly schedules by selecting project stages per month
  - Auto-carryover: Uncollected stages from previous months auto-appear as "Due from [month]"
  - Planning can request payment for stages → Sends to CRE for collection
  - 5 summary cards: Total Planned, Collected, Balance, Carry Over Due, Requested
  - Month navigation (prev/next) with all entries in table format
  - "Add Stages" dialog to select available project stages
  - Standalone `/payment-schedule` page for Super Admin
  - Super Admin header updated with Payment Schedule and HR links
  - Backend: 6 new endpoints for schedule CRUD, add-stages, request-payment, months-list
  - Role-based: Planning has full access, CRE has read-only, Super Admin sees all

- [x] **Material Request Workflow Fix (Mar 18, 2026)**:
  - Fixed broken Planning Board → Requests tab (endpoints returned 404)
  - Created 4 new endpoints: GET /api/material-requests, GET /api/labour-expenses, PATCH /api/material-requests/{id}/planning-action, PATCH /api/labour-expenses/{id}/planning-action
  - Full workflow verified: Site Engineer → Planning approve → Procurement → Accountant
  - Fixed React key warning on Planning Board

## Backlog
- [ ] Aadhar Document Upload with encrypted storage (P1)
- [ ] UI/UX review across all screens (P2)
- [ ] Convert to SaaS model (multi-tenancy, subscriptions) (P2)
- [ ] Production deployment guidance (P2)
