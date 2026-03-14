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
| **Architect** | **/architect-dashboard** | **Site plans, 3D/elevation, design workflow** |

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync
- [x] Pre-Sales -> Sales transfer, RNR Stage + Pipeline Stage Management
- [x] Deal conversion, project creation, work orders
- [x] Material request/procurement/approval workflow
- [x] Site Engineer Mini Cashbook + Petty Cash
- [x] Accountant Cashbook, Cheque Management, Project Summary
- [x] Income/Expense Approval System
- [x] Masked Financial Values, Super Admin auto-creation
- [x] Forgot Password + Role-based access control
- [x] 360 degree seed data for Murugan Vadapalani project
- [x] CRE Dashboard 5-tab redesign
- [x] Planning Board simplification (tabs-only)
- [x] Dynamic Cheque Entry
- [x] PM Dashboard & Permissions (financial data hidden)
- [x] Gantt Chart for Project Timelines (Mar 14, 2026)
- [x] **Architect Dashboard & Design Workflow (Mar 14, 2026)**:
  - New "architect" role with dedicated dashboard
  - All Projects view (no financial data) with search & status filter
  - **Site Plans tab**: Floor-wise list with status workflow (yet_to_start → design → approval_waiting → approved)
  - **3D Photos & Elevations tab**: Simple file management with Google Drive links
  - Every entry supports Google Drive link
  - Submit for GM approval workflow
  - **GM Dashboard**: New "Design" tab for approving/rejecting site plans
  - **Project Documents tab**: Architect designs visible to all roles

## Credentials
- Super Admin: `admin@constructionos.com` / `Demo@1234`
- GM: `gm@constructionos.com` / `Demo@1234`
- CRE: `cre@constructionos.com` / `Demo@1234`
- Accountant: `accountant@constructionos.com` / `Demo@1234`
- Project Manager: `pm@constructionos.com` / `Demo@1234`
- Planning: `planning@constructionos.com` / `Demo@1234`
- Procurement: `procurement@constructionos.com` / `Demo@1234`
- Site Engineer: `engineer@constructionos.com` / `Demo@1234`
- Pre-Sales: `presales@constructionos.com` / `Demo@1234`
- Sales: `sales@constructionos.com` / `Demo@1234`
- **Architect**: `architect@constructionos.com` / `Demo@1234`

## Key API Endpoints - Architect
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/architect/projects | All projects (no financials) |
| GET | /api/architect/projects/{id}/site-plans | Floor-wise site plans |
| POST | /api/architect/projects/{id}/site-plans | Add site plan |
| PATCH | /api/architect/projects/{id}/site-plans/{id} | Update site plan |
| POST | /api/architect/projects/{id}/site-plans/{id}/submit | Submit for GM approval |
| DELETE | /api/architect/projects/{id}/site-plans/{id} | Delete site plan |
| GET | /api/architect/projects/{id}/design-files | 3D photos & elevations |
| POST | /api/architect/projects/{id}/design-files | Add design file |
| PATCH | /api/architect/projects/{id}/design-files/{id} | Update design file |
| DELETE | /api/architect/projects/{id}/design-files/{id} | Delete design file |
| GET | /api/architect/pending-approvals | GM: pending site plan approvals |
| PATCH | /api/architect/site-plans/{id}/approve | GM: approve/reject |
| GET | /api/architect/projects/{id}/all-design-data | Combined data for Documents tab |

## DB Collections - Architect
- `site_plans`: plan_id, project_id, floor_name, drive_link, status, remarks, created_by, submitted_at, approved_by
- `design_files`: file_id, project_id, file_name, file_type (3d_photo/elevation), drive_link, remarks, created_by

## Backlog
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review across all screens
- [ ] Production deployment guidance
- [ ] Optimize /api/cre/dashboard-summary endpoint (~3.5s response time)
