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
  - Super Admin can configure the indirect cost % via Settings > Company Profile (default 20%)
  - All budget calculations dynamically use the configured percentage
  - UI labels update everywhere: Budget Overview cards, table headers, rule name

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
- Client: `raj@client.com` / `Demo@1234`

## Key API Endpoints - Indirect Cost Module
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/financial/project-budget-overview | All projects with 80/20 budget split |
| GET | /api/financial/indirect-cost-distribution-preview?amount=X | Preview auto-distribution |
| GET | /api/financial/indirect-cost-allocations | Distribution history |
| POST | /api/financial/indirect-costs | Create indirect cost (pending approval) |
| PATCH | /api/financial/indirect-costs/{id}/approve | Approve/reject |
| PATCH | /api/financial/indirect-costs/{id}/confirm | Confirm payment + auto-distribute |

## Backlog
- [ ] Aadhar Document Upload with encrypted storage (P1)
- [ ] UI/UX review across all screens (P2)
- [ ] Convert to SaaS model (multi-tenancy, subscriptions) (P2)
- [ ] Production deployment guidance (P2)
