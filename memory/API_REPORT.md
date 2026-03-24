# API Report — My Home USB Construction Management System

**Total APIs: 528 endpoints across 10 route files**

---

## 1. Authentication & Security — `auth.py` (16 APIs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/auth/setup-status` | Check initial setup status |
| POST | `/api/auth/initial-setup` | First-time system setup |
| GET | `/api/security/status` | Security dashboard status |
| GET | `/api/security/audit-logs` | View security audit logs |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/demo-login` | Demo/test login |
| POST | `/api/auth/forgot-password` | Password reset request |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/invite-user` | Invite new user |
| GET | `/api/auth/verify-invitation/{token}` | Verify invitation token |
| POST | `/api/auth/setup-password` | Setup password from invite |
| GET | `/api/auth/invitations` | List pending invitations |
| DELETE | `/api/auth/invitations/{id}` | Cancel invitation |
| POST | `/api/auth/resend-invitation/{email}` | Resend invitation email |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/logout` | Logout |

---

## 2. CRM & Sales Pipeline — `crm.py` (77 APIs)

### Pre-Sales (3)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crm/pre-sales/dashboard` | Pre-sales dashboard stats |
| GET | `/api/crm/pre-sales/leads` | List pre-sales leads |
| POST | `/api/crm/pre-sales/leads` | Create pre-sales lead |

### Sales Leads & Pipeline (18)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/crm/leads` | Create sales lead |
| PATCH | `/api/crm/leads/{id}/stage` | Move lead to stage (with intercepts) |
| GET | `/api/crm/leads/{id}` | Get lead detail |
| PATCH | `/api/crm/leads/{id}` | Update lead |
| PATCH | `/api/crm/leads/{id}/appointment` | Schedule appointment |
| POST | `/api/crm/leads/{id}/remarks` | Add remark to lead |
| POST | `/api/crm/leads/{id}/follow-ups` | Schedule follow-up |
| PATCH | `/api/crm/leads/{id}/follow-ups/{fu_id}/complete` | Mark follow-up done |
| GET | `/api/crm/sales/dashboard` | Sales dashboard stats |
| GET | `/api/crm/sales/leads` | List sales leads (with auto-followup move) |
| GET | `/api/crm/sales-overview` | Sales overview cards |

### Project Onboarding (4)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/crm/leads/{id}/collect-advance` | Collect advance payment |
| POST | `/api/crm/leads/{id}/send-to-accountant` | Send to accountant verification |
| POST | `/api/crm/leads/{id}/accountant-verify` | Accountant verifies (auto-moves to Project Onboarded) |
| POST | `/api/crm/leads/{id}/move-to-planning` | Move project to planning team |

### Site Visit Management (7)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crm/sr-site-engineers` | List Sr. Site Engineers |
| GET | `/api/crm/site-engineers` | List all Site Engineers |
| GET | `/api/crm/ongoing-projects` | Ongoing projects for site visits |
| POST | `/api/crm/leads/{id}/assign-site-visit` | Assign site visit (Client Land / Our Projects) |
| POST | `/api/crm/leads/{id}/assign-jr-engineer` | Sr. Engineer assigns Jr. Engineer |
| POST | `/api/crm/leads/{id}/complete-site-visit` | Mark site visit done |
| GET | `/api/crm/my-site-visits` | Engineer's assigned visits (today/upcoming/past) |

### Stages & Custom Fields (8)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crm/stages` | List pipeline stages |
| POST | `/api/crm/stages` | Create stage |
| PATCH | `/api/crm/stages/{id}` | Update stage |
| DELETE | `/api/crm/stages/{id}` | Delete stage |
| GET | `/api/crm/stages/with-counts` | Stages with lead counts |
| GET | `/api/crm/custom-fields` | List custom fields |
| POST | `/api/crm/custom-fields` | Create custom field |
| PATCH/DELETE | `/api/crm/custom-fields/{id}` | Update/delete custom field |

### Rough Estimate (RE) Projects (12)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crm/re-projects` | List RE projects |
| GET | `/api/crm/re-projects/search` | Search RE by number |
| GET | `/api/crm/re-projects/by-number/{num}` | Get RE by number |
| GET | `/api/crm/re-projects/{id}` | RE project detail |
| PATCH | `/api/crm/re-projects/{id}` | Update RE project (with change log) |
| GET | `/api/crm/re-projects/{id}/change-logs` | View edit history |
| POST | `/api/crm/re-projects/{id}/submit-for-approval` | Submit RE for GM approval |
| PATCH | `/api/crm/re-projects/{id}/approve` | GM approves RE |
| POST | `/api/crm/re-projects/{id}/send-to-client` | Send RE to client |
| POST | `/api/crm/re-projects/{id}/client-feedback` | Record client feedback |
| POST | `/api/crm/re-projects/{id}/client-approve` | Client approves RE |
| POST | `/api/crm/re-projects/{id}/create-revision` | Create RE revision |

### Marketing & Distribution (7)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/PATCH | `/api/marketing/distribution-settings` | Lead distribution settings |
| GET | `/api/marketing/dashboard` | Marketing dashboard |
| GET/POST | `/api/marketing/team-members` | Manage marketing team |
| POST | `/api/marketing/assign-lead/{id}` | Assign lead to team member |
| GET | `/api/marketing/all-leads` | All marketing leads |
| DELETE | `/api/marketing/leads/{id}` | Delete marketing lead |

### Google Sheets Integration (16)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sheets/config` | Sheets configuration |
| GET | `/api/sheets/oauth/login` | Google OAuth login |
| GET | `/api/oauth/sheets/callback` | OAuth callback |
| POST | `/api/sheets/disconnect` | Disconnect sheets |
| POST | `/api/sheets/preview` | Preview sheet data |
| POST | `/api/sheets/preview-all-tabs` | Preview all tabs |
| POST | `/api/sheets/import-all-tabs` | Import all tabs |
| POST/GET | `/api/sheets/sources` | Sheet sources management |
| POST | `/api/sheets/import` | Import single sheet |
| POST | `/api/sheets/import-all` | Import all sheets |
| POST | `/api/sheets/export` | Export data to sheets |
| POST/GET | `/api/sheets/auto-sync/config` | Auto-sync configuration |
| POST | `/api/sheets/auto-sync/run` | Run auto-sync |
| GET | `/api/sheets/connected` | Connected spreadsheets |
| GET | `/api/leads/sources` | Lead sources |

---

## 3. Operations & CRE — `operations.py` (112 APIs)

### CRE (Client Relationship) (18)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cre/dashboard` | CRE dashboard |
| GET | `/api/cre/new-deals` | New deals list |
| POST | `/api/cre/convert-deal/{id}` | Convert deal to project (with advance) |
| POST | `/api/cre/convert-re-project/{id}` | Convert RE project to project |
| PATCH | `/api/cre/projects/{id}/accountant-verify` | Accountant verify project |
| PATCH | `/api/cre/projects/{id}/send-to-planning` | Send to planning |
| PATCH | `/api/cre/projects/{id}/move-to-drawing` | Move to drawing |
| GET | `/api/cre/payment-requests` | Payment requests |
| POST | `/api/cre/projects` | Create project |
| PATCH | `/api/cre/projects/{id}/submit` | Submit project |
| POST | `/api/cre/projects/{id}/add-payment-milestone` | Add payment milestone |
| GET | `/api/cre/projects/all` | All CRE projects |
| POST | `/api/cre/projects/request-re` | Request rough estimate |

### Planning (12)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/planning/dashboard` | Planning dashboard |
| GET | `/api/planning/projects` | Planning projects |
| PATCH | `/api/planning/projects/{id}/submit-for-approval` | Submit for approval |
| GET | `/api/planning/stage-dashboard` | Stage dashboard |
| GET | `/api/planning/projects-by-stage` | Projects by stage |
| PATCH | `/api/planning/projects/{id}/update-stage` | Update project stage |
| GET | `/api/planning/projects/{id}/stage-history` | Stage history |
| GET | `/api/planning/payment-schedule-overview` | Payment schedule overview |
| GET | `/api/planning/monthly-schedule` | Monthly schedule |
| POST | `/api/planning/monthly-schedule/add-stages` | Add stages to schedule |

### Approvals (5)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/approvals/projects` | Projects pending approval |
| PATCH | `/api/approvals/projects/{id}/gm-approve` | GM approval |
| PATCH | `/api/approvals/projects/{id}/final-approve` | Final approval |
| PATCH | `/api/approvals/projects/{id}/reject` | Reject project |

### Work Orders (16)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/work-orders` | List work orders |
| POST | `/api/work-orders/labour` | Create labour work order |
| POST | `/api/work-orders/material` | Create material work order |
| PATCH | `/api/work-orders/{id}/assign` | Assign work order |
| PATCH | `/api/work-orders/{id}/stages/{sid}/start` | Start stage |
| PATCH | `/api/work-orders/{id}/stages/{sid}/complete` | Complete stage |
| PATCH | `/api/work-orders/{id}/stages/{sid}/request-payment` | Request payment |
| PATCH | `/api/work-orders/{id}/stages/{sid}/approve-payment` | Approve payment |

### HR Management (16)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/hr/staff` | Staff management |
| PATCH | `/api/hr/staff/{id}` | Update staff |
| POST | `/api/hr/staff/{id}/upload-document` | Upload document |
| GET/POST | `/api/hr/attendance` | Attendance tracking |
| GET | `/api/hr/payroll` | Payroll list |
| POST | `/api/hr/payroll/generate` | Generate payroll |
| PATCH | `/api/hr/payroll/{id}/approve` | Approve payroll |
| PATCH | `/api/hr/payroll/{id}/pay` | Process payroll payment |
| POST | `/api/hr/users/create` | Create user account |

### Accountant Operations (20+)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/accounts/dashboard` | Accounts dashboard |
| GET | `/api/accounts/pending-advance-payments` | Pending advances |
| PATCH | `/api/accounts/verify-advance-payment/{id}` | Verify advance |
| GET | `/api/accounts/pending-payments` | Pending payments |
| PATCH | `/api/accounts/process-payment/{type}/{id}` | Process payment |
| GET | `/api/accountant/comprehensive-dashboard` | Full dashboard |
| GET/POST | `/api/accountant/transactions` | Transaction management |
| GET/POST | `/api/accountant/cheques` | Cheque management |
| POST | `/api/accountant/payment-request/initiate` | Payment request flow |

### Financial Controls (15+)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/financial/indirect-costs` | Indirect cost management |
| GET | `/api/financial/project-budget-overview` | Budget overview |
| GET | `/api/financial/suspense` | Suspense account |
| GET | `/api/financial/control-dashboard` | Financial control dashboard |
| GET | `/api/financial/audit-logs` | Audit trail |

---

## 4. Financial — `financial.py` (73 APIs)

### Income Management (7)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/income` | List income entries |
| GET | `/api/income/summary` | Income summary |
| GET | `/api/projects/{id}/income` | Project income |
| POST | `/api/income` | Record income |
| PATCH | `/api/income/{id}` | Update income |
| DELETE | `/api/income/{id}` | Delete income |

### Expense Management (18)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/expenses/material` | Material expenses |
| GET/POST | `/api/expenses/labour` | Labour expenses |
| GET/POST | `/api/expenses/vendor-service` | Vendor service expenses |
| PATCH | `/api/expenses/{id}/payment` | Process expense payment |
| GET | `/api/expenses/summary` | Expense summary |
| GET | `/api/expenses/pending-approvals` | Pending approvals |

### Cashbook & Suspense (7)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cashbook` | Cashbook entries |
| POST | `/api/cashbook/manual-expense` | Manual expense entry |
| GET | `/api/suspense/overview` | Suspense overview |
| POST | `/api/suspense/payment` | Suspense payment |

### Materials & Vendors (16)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/materials` | Material master |
| GET | `/api/materials/categories` | Material categories |
| GET/POST | `/api/vendor-master` | Vendor master |
| GET | `/api/vendor-categories` | Vendor categories |
| GET | `/api/purchase-orders` | Purchase orders |

### Settings & Users (10)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST/PATCH | `/api/settings/company` | Company settings |
| GET | `/api/users/{id}` | User details |
| PATCH | `/api/users/{id}` | Update user |
| GET | `/api/roles` | Available roles |
| GET | `/api/accountant/cashbook-filtered` | Filtered cashbook |
| POST | `/api/accountant/cheque-payment` | Cheque payment |

---

## 5. Site Operations — `site_ops.py` (56 APIs)

### Site Engineer (18)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST/GET | `/api/site-engineer/assignments` | Project assignments |
| GET | `/api/site-engineer/my-projects` | My projects |
| GET | `/api/site-engineer/project/{id}` | Project detail |
| POST | `/api/site-engineer/material-requests` | Create material request |
| POST | `/api/site-engineer/labour-requests` | Create labour request |
| POST | `/api/site-engineer/material-receipts/initiate` | Material receipt with OTP |
| POST | `/api/projects/{id}/daily-progress` | Daily progress report |
| POST | `/api/site-engineer/petty-cash/request` | Petty cash request |
| GET | `/api/site-engineer/mini-cashbook` | Mini cashbook |

### Project Manager (8)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/pm/dashboard` | PM dashboard |
| GET | `/api/pm/projects` | PM projects |
| GET/PATCH | `/api/pm/material-requests` | Review material requests |
| POST | `/api/pm/assign-team` | Assign team members |
| POST | `/api/pm/create-site-engineer` | Create site engineer user |

### Accountant Site Ops (14)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/accountant/material-requests` | Material requests |
| GET | `/api/accountant/labour-requests` | Labour requests |
| PATCH | `/api/accountant/petty-cash/{id}/issue` | Issue petty cash |
| PATCH | `/api/accountant/petty-cash/{id}/settle` | Settle petty cash |
| POST | `/api/accountant/record-expense` | Record expense |

---

## 6. Procurement — `procurement.py` (43 APIs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/procurement/dashboard` | Procurement dashboard |
| GET | `/api/procurement/requests` | Material requests |
| POST | `/api/procurement/start-pricing/{id}` | Start pricing process |
| POST | `/api/procurement/pricing/{id}/add-quote` | Add vendor quote |
| PATCH | `/api/procurement/pricing/{id}/select-vendor` | Select vendor |
| POST | `/api/procurement/v2/generate-po/{id}` | Generate purchase order |
| PATCH | `/api/procurement/v2/dispatch/{id}` | Dispatch material |
| POST | `/api/procurement/v2/receive/{id}` | Receive material |
| GET | `/api/procurement/credit-ledger` | Credit ledger |
| GET | `/api/procurement/transit` | Transit tracking |
| GET | `/api/procurement/reports/*` | Spend reports |
| GET/POST | `/api/packages` | Package management |
| GET/POST | `/api/labour-contractors` | Labour contractor management |

---

## 7. Projects — `projects.py` (112 APIs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/projects` | Project CRUD |
| GET | `/api/projects/{id}/comprehensive` | Full project details |
| GET/POST | `/api/boq` | Bill of quantities |
| GET/POST | `/api/payment-stages` | Payment stage management |
| POST | `/api/projects/{id}/payment-schedule/generate` | Generate payment schedule |
| GET | `/api/projects/{id}/payment-summary` | Payment summary |
| POST | `/api/scope-items/bulk` | Bulk scope items |
| POST | `/api/deductions/bulk` | Bulk deductions |
| GET | `/api/admin/dashboard-summary` | Admin dashboard |
| GET | `/api/admin/financial-overview` | Financial overview |
| GET | `/api/projects/{id}/team` | Project team |
| GET | `/api/vendor-portal/dashboard` | Vendor portal |
| POST | `/api/site-photos/upload` | Upload site photos |

---

## 8. Architecture & Design — `architect.py` (13 APIs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/projects/{id}/site-plans` | Site plan management |
| POST | `/api/projects/{id}/site-plans/{pid}/submit` | Submit for approval |
| PATCH | `/api/site-plans/{id}/approve` | Approve site plan |
| GET/POST | `/api/projects/{id}/design-files` | Design file management |

---

## 9. Contractors — `contractors.py` (22 APIs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/contractors` | Contractor management |
| GET | `/api/contractors/{id}/summary` | Contractor summary |
| GET/POST | `/api/labour-work-orders` | Labour work orders |
| GET/POST | `/api/labour-attendance` | Attendance tracking |
| GET/POST | `/api/material-inventory` | Material inventory |

---

## 10. File Management — `files.py` (4 APIs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/files/upload` | Upload file |
| GET | `/api/files/{id}/download` | Download file |
| GET | `/api/files` | List files |
| DELETE | `/api/files/{id}` | Delete file |

---

## 3rd Party Integrations Used

| Service | Purpose |
|---------|---------|
| MongoDB Atlas | Primary database |
| Google Sheets API | Lead import/export/sync |
| Resend | Email notifications |
| Emergent Object Storage | File uploads |
| Leaflet/OpenStreetMap | Location mapping |
| jsPDF / jspdf-autotable | PDF generation |

---

## Summary by Module

| Module | File | APIs | Key Features |
|--------|------|------|-------------|
| Auth & Security | auth.py | 16 | Login, invites, password management |
| CRM & Sales | crm.py | 77 | Pipeline, leads, RE, marketing, site visits |
| Operations | operations.py | 112 | CRE, planning, work orders, HR, accounts |
| Financial | financial.py | 73 | Income, expenses, cashbook, vendors |
| Site Operations | site_ops.py | 56 | Site engineer, PM, material/labour |
| Procurement | procurement.py | 43 | Pricing, POs, transit, credit |
| Projects | projects.py | 112 | Projects, BOQ, payments, scope |
| Architecture | architect.py | 13 | Site plans, design files |
| Contractors | contractors.py | 22 | Contractors, attendance, inventory |
| Files | files.py | 4 | File upload/download |
| **Total** | | **528** | |
