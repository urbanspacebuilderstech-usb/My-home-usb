# ConstructionOS - Complete Screen & Flow Review Document
## For User Input: Inputs, Logic, Restrictions, Components, UI

> **Instructions**: Review each screen below. For each, tell me:
> - What inputs/fields to ADD, REMOVE, or CHANGE
> - What business logic or restrictions to apply
> - What extra components you need (charts, maps, export, etc.)
> - What UI changes you want
>
> Mark each screen: OK (no changes) / NEEDS CHANGES (describe what)

---

## MODULE 1: LOGIN & AUTH
### Screen 1.1: Login Page (`/login`)
**Current State**: Demo login only (email dropdown + quick access buttons). No password field.
- Inputs: Email dropdown selector
- No password, no registration, no "forgot password"

**Your Input Needed**:
- [ ] Add real password login?
- [ ] Add "Forgot Password" flow?
- [ ] Add user registration/signup? Or invite-only?
- [ ] Keep demo login for testing? Or remove for production?
- [ ] Company logo / branding?
- [ ] Any terms & conditions checkbox?

---

## MODULE 2: SUPER ADMIN
### Screen 2.1: Super Admin Dashboard (`/dashboard`)
**Current State**: Overview with project stats, recent projects table, quick create project dialog
- Cards: Total Projects, Active, Completed, Total Value
- Table: Project list with status, value, dates
- Dialog: Create New Project form (name, client, value, dates)

**Your Input Needed**:
- [ ] What additional stats/KPIs on dashboard?
- [ ] What charts needed? (revenue trend, project timeline, etc.)
- [ ] Create project form - what fields? Current: name, client name, total value, start date, completion date, status
- [ ] Any quick actions missing?

### Screen 2.2: User Management (`/users`)
**Current State**: User list with create/edit/deactivate. Invite user by email
- Table: Users with name, email, role, phone, status
- Dialog: Create User (name, email, phone, role dropdown)
- Dialog: Invite User (email, role)

**Your Input Needed**:
- [ ] What user fields? (department, reporting to, profile photo?)
- [ ] Role assignment rules? (who can create which roles?)
- [ ] Bulk user import?
- [ ] User activity log?

### Screen 2.3: Settings (`/settings`)
**Current State**: Company settings, system configuration
- Company name, address, phone, email, GST, PAN
- System settings tabs

**Your Input Needed**:
- [ ] What company fields needed?
- [ ] Tax configuration?
- [ ] Notification preferences?
- [ ] Backup/export settings?

### Screen 2.4: Notification Center (`/notifications`)
**Current State**: Simple notification list with read/unread

**Your Input Needed**:
- [ ] Notification categories? (approvals, payments, materials, etc.)
- [ ] Email notification rules?
- [ ] Push notifications?

---

## MODULE 3: PROJECTS
### Screen 3.1: Projects List (`/projects`)
**Current State**: Project cards/table with search, filter by status
- Table: Name, client, status, value, dates, PM
- Dialog: Create Project form
- Filters: Status dropdown

**Your Input Needed**:
- [ ] What project fields in creation form?
- [ ] Project categories/types?
- [ ] Advanced filters? (date range, PM, value range, location?)
- [ ] Export to Excel/PDF?
- [ ] Project template feature?

### Screen 3.2: Project Detail (`/projects/:id`) - LARGEST SCREEN (2766 lines, 12 tables, 148 dialogs)
**Current State**: Comprehensive project view with multiple tabs:
- Overview tab: Project info, status, team
- Scope Items tab: BOQ items list with add/edit/delete
- Payment Schedule tab: Stage-wise payments
- Deductions tab: Deduction items
- Additional Costs tab: Extra costs
- Work Orders tab: Work order management
- Documents tab: File uploads
- Site Photos tab: Photo gallery

**Your Input Needed**:
- [ ] Which tabs to keep/remove/rename?
- [ ] What fields in project overview?
- [ ] Scope item fields? (item, description, unit, qty, rate, amount, verified, approved?)
- [ ] Payment schedule logic? (stage name, %, amount, due date, status?)
- [ ] What approval workflow for scope changes?
- [ ] Document categories?
- [ ] Photo requirements? (GPS tagged, date stamped?)

### Screen 3.3: Comprehensive Project View (`/projects/:id/comprehensive`)
**Current State**: Detailed financial view with BOQ, payment summary, income tracking

**Your Input Needed**:
- [ ] What financial metrics to show?
- [ ] Comparison views? (estimated vs actual?)
- [ ] Export to PDF/Excel?

### Screen 3.4: BOQ Management (`/boq/:id`)
**Current State**: Bill of Quantities with add/edit items
- Fields: Item name, description, unit, quantity, rate

**Your Input Needed**:
- [ ] BOQ categories?
- [ ] Auto-calculation rules?
- [ ] Version history?
- [ ] Import from Excel?

### Screen 3.5: Project Materials (`/projects/:id/materials`)
**Current State**: Brand/material selection for project items

**Your Input Needed**:
- [ ] Material approval workflow?
- [ ] Brand comparison view?

---

## MODULE 4: CRM (Pre-Sales → Sales → Conversion)
### Screen 4.1: CRM Pre-Sales (`/crm-pre-sales`) - 1669 lines, 124 dialogs
**Current State**: Kanban board with lead stages, lead details, assignment
- Stages: New, Contacted, Qualified, Proposal, Negotiation
- Lead fields: Name, phone, email, source, location, budget, notes
- Lead distribution to sales team

**Your Input Needed**:
- [ ] What lead stages? (customize names?)
- [ ] What lead fields are mandatory?
- [ ] Lead scoring criteria?
- [ ] Auto-assignment rules?
- [ ] Follow-up reminders?
- [ ] WhatsApp/SMS integration for follow-up?

### Screen 4.2: CRM Sales (`/crm-sales`) - 1000 lines
**Current State**: Sales pipeline with deal tracking

**Your Input Needed**:
- [ ] Sales stages?
- [ ] Deal fields? (value, probability, expected close date?)
- [ ] Quotation generation?
- [ ] Meeting/call log?

### Screen 4.3: Marketing Board (`/marketing-board`) - 2372 lines, 140 dialogs
**Current State**: Google Sheets integration for lead import, lead source tracking, distribution

**Your Input Needed**:
- [ ] Lead sources to track? (Meta, Google, Website, Walk-in, Referral?)
- [ ] Google Sheets auto-sync frequency?
- [ ] Campaign tracking?
- [ ] ROI per source?

### Screen 4.4: RE Projects (`/crm/re-projects`)
**Current State**: Real Estate project listing for CRM

**Your Input Needed**:
- [ ] What RE project fields?
- [ ] Unit/flat inventory management?

### Screen 4.5: Custom Fields Builder (`/crm/custom-fields`)
**Current State**: Dynamic field creation for leads

**Your Input Needed**:
- [ ] Field types needed? (text, number, dropdown, date, file?)
- [ ] Field validation rules?

### Screen 4.6: CSV Import (`/crm/import-csv`)
**Current State**: Bulk lead import from CSV files

**Your Input Needed**:
- [ ] Column mapping UI?
- [ ] Duplicate detection?
- [ ] Import validation rules?

---

## MODULE 5: CRE (Client Relationship Executive)
### Screen 5.1: CRE Board (`/cre-board`) - 1759 lines, 71 dialogs
**Current State**: Deal conversion, client relationship management
- New deals from sales
- Convert deal to project
- Client interaction tracking

**Your Input Needed**:
- [ ] Conversion workflow steps?
- [ ] What happens after deal → project conversion?
- [ ] Client communication log?
- [ ] Estimate/quotation generation?

---

## MODULE 6: PLANNING
### Screen 6.1: Planning Board (`/planning-board`) - 936 lines, 73 dialogs
**Current State**: Project planning with construction stages
- Project list with planning status
- Submit for approval workflow
- Construction stage management (Foundation, Framing, Roofing, etc.)

**Your Input Needed**:
- [ ] Construction stages list? (customize per project type?)
- [ ] Gantt chart needed?
- [ ] Resource allocation view?
- [ ] Timeline dependencies?
- [ ] Approval workflow: Planning → GM → Super Admin?

---

## MODULE 7: PROCUREMENT
### Screen 7.1: Procurement Dashboard (`/procurement-board`) - 841 lines
**Current State**: Overview of procurement requests, vendor quotes, purchase orders

### Screen 7.2: Procurement Board V2 (`/procurement-board-v2`) - 1196 lines, 74 dialogs
**Current State**: Advanced procurement with multi-vendor quoting
- Request from site → Procurement pricing → Vendor selection → PO generation
- Vendor quote comparison
- Account verification flow

**Your Input Needed**:
- [ ] Procurement workflow steps?
- [ ] Minimum quotes required before selection?
- [ ] Auto-PO generation rules?
- [ ] Delivery tracking?
- [ ] GRN (Goods Receipt Note)?

### Screen 7.3: Vendor Master (`/vendor-management`) - 491 lines
**Current State**: Vendor directory with add/edit

**Your Input Needed**:
- [ ] Vendor fields? (name, GST, PAN, bank details, category, rating?)
- [ ] Vendor performance tracking?
- [ ] Vendor payment terms?
- [ ] Blacklist/whitelist?

### Screen 7.4: Vendor Portal (`/vendor-portal`)
**Current State**: Vendor self-service for PO dispatch

**Your Input Needed**:
- [ ] What can vendors see/do?
- [ ] Invoice upload?
- [ ] Payment status view?

### Screen 7.5: Labour Contractors (`/labour-contractors`)
**Current State**: Labour contractor management

**Your Input Needed**:
- [ ] Contractor fields?
- [ ] Rate card management?
- [ ] Attendance integration?

---

## MODULE 8: SITE ENGINEER
### Screen 8.1: Site Engineer Dashboard (`/site-engineer`) - 830 lines, 49 dialogs
**Current State**: Assigned projects, material/labour request creation

### Screen 8.2: Site Engineer Project View (`/site-engineer/project/:id`) - 744 lines, 70 dialogs
**Current State**: Project-specific site operations
- Site photos upload with GPS
- Material request creation
- Labour request creation
- Daily progress update

**Your Input Needed**:
- [ ] Daily report format? (work done, workers count, materials used?)
- [ ] Photo requirements? (before/after, GPS mandatory?)
- [ ] Material request fields? (item, qty, urgency, purpose?)
- [ ] Labour request fields?
- [ ] Weather logging?
- [ ] Safety checklist?

### Screen 8.3: Material Receipt (`/site-engineer/material-receipt`) - 665 lines
**Current State**: Confirm material delivery with photo + GPS
- Lorry photo capture
- Material photo capture
- GPS location capture
- Quantity verification

**Your Input Needed**:
- [ ] Receipt fields? (PO reference, vendor, qty received vs ordered?)
- [ ] Quality check fields?
- [ ] Shortage/damage reporting?

### Screen 8.4: Site Receipt (`/site-receipt`)
**Current State**: General site receipt creation with image upload

**Your Input Needed**:
- [ ] Receipt types? (material, equipment, tools?)
- [ ] Approval needed?

---

## MODULE 9: PROJECT MANAGER
### Screen 9.1: PM Dashboard (`/pm-dashboard`) - 557 lines
**Current State**: PM's assigned projects overview, material requests, team management

**Your Input Needed**:
- [ ] What KPIs for PM?
- [ ] Budget tracking view?
- [ ] Team performance metrics?
- [ ] Escalation rules?

---

## MODULE 10: GENERAL MANAGER
### Screen 10.1: GM Dashboard (`/gm-dashboard`) - 1354 lines, 52 dialogs
**Current State**: Command center with tabs - Overview, Planning, Projects, Site Engineer, Accounts
- Approval actions for projects
- Cross-module visibility

**Your Input Needed**:
- [ ] What approval types? (projects, budgets, expenses, scope changes?)
- [ ] Financial summary view?
- [ ] Team performance view?
- [ ] Alert/escalation dashboard?

---

## MODULE 11: ACCOUNTS & FINANCE
### Screen 11.1: Accountant Dashboard (`/accountant-dashboard`) - 616 lines
**Current State**: Quick links to accounting modules

### Screen 11.2: Accountant Module (`/accountant-module`) - 1226 lines, 79 dialogs
**Current State**: Tabs - Verify Requests, View Income, Record Expenses, Suspense Account
- Petty cash approval
- Income verification
- Expense recording with categories

**Your Input Needed**:
- [ ] Expense categories list?
- [ ] Approval limits? (who approves what amount?)
- [ ] Receipt/invoice upload mandatory?
- [ ] GST input tracking?

### Screen 11.3: Accounts Board (`/accounts-board`) - 724 lines
**Current State**: Advance payment verification, payment tracking

### Screen 11.4: Income Management (`/income`) - 606 lines
**Current State**: Income entry with project, amount, date, payment mode, reference

**Your Input Needed**:
- [ ] Payment modes? (Cash, Cheque, NEFT, RTGS, UPI?)
- [ ] TDS deduction tracking?
- [ ] Receipt generation?
- [ ] Auto bank reconciliation?

### Screen 11.5: Expense Management (`/expense-management`) - 890 lines, 74 dialogs
**Current State**: Material, Labour, Vendor expenses with full CRUD
- Material expenses: project, vendor, material, qty, rate
- Labour expenses: project, contractor, workers, days, rate
- Vendor service expenses: project, vendor, service, amount

**Your Input Needed**:
- [ ] Expense approval workflow?
- [ ] Budget vs actual comparison?
- [ ] Category-wise limits?

### Screen 11.6: Cheque Management (`/cheque-management`) - 718 lines
**Current State**: Cheque issuance, tracking, return handling

**Your Input Needed**:
- [ ] Cheque fields? (number, bank, date, payee, amount?)
- [ ] PDC (Post-Dated Cheque) tracking?
- [ ] Cheque bounce flow?

### Screen 11.7: Payment Processing (`/payment-processing`) - 568 lines
**Current State**: Payment recording and verification with OTP

**Your Input Needed**:
- [ ] Payment approval levels?
- [ ] OTP verification for which amounts?
- [ ] Payment scheduling?

### Screen 11.8: Indirect Cost Management (`/indirect-costs`) - 601 lines
**Current State**: Non-project overhead costs tracking

### Screen 11.9: Suspense Account (`/suspense-account`) - 543 lines
**Current State**: Unreconciled amounts management

### Screen 11.10: Financial Overview (`/financial-overview`) - 445 lines
**Current State**: Company-wide financial dashboard

**Your Input Needed**:
- [ ] What financial reports needed?
- [ ] P&L statement view?
- [ ] Cash flow view?
- [ ] Outstanding receivables/payables?

---

## MODULE 12: HR
### Screen 12.1: HR Portal (`/hr-portal`) - 805 lines, 52 dialogs
**Current State**: Staff management, attendance, payroll
- Staff CRUD
- Attendance marking
- Payroll calculation

**Your Input Needed**:
- [ ] Staff fields? (name, role, department, salary, bank details, ID proofs?)
- [ ] Attendance method? (biometric, manual, GPS-based?)
- [ ] Payroll components? (basic, HRA, DA, PF, ESI?)
- [ ] Leave management?
- [ ] Salary slip generation?

---

## MODULE 13: WORK ORDERS
### Screen 13.1: Work Orders (`/work-orders`) - 339 lines
**Current State**: Work order list with create/edit

### Screen 13.2: Work Order Management (`/work-order-management`) - 664 lines
**Current State**: Detailed work order management with stages

**Your Input Needed**:
- [ ] Work order fields? (project, scope item, contractor, qty, rate, timeline?)
- [ ] Work order stages? (created, issued, in-progress, completed, verified?)
- [ ] Measurement book integration?
- [ ] Running bill generation?

---

## MODULE 14: PACKAGES
### Screen 14.1: Package Management (`/packages`) - 613 lines
**Current State**: Package/bundle creation for standard offerings

**Your Input Needed**:
- [ ] Package fields? (name, items, rates, validity?)
- [ ] Package customization?
- [ ] Auto-BOQ generation from package?

---

## MODULE 15: CLIENT PORTAL
### Screen 15.1: Client Portal (`/client-portal`) - 657 lines
**Current State**: Client view of their project progress, payment status
- Project overview
- Payment schedule
- Site photos
- Documents

**Your Input Needed**:
- [ ] What can client see?
- [ ] Payment gateway for online payment?
- [ ] Document download?
- [ ] Progress photo gallery?
- [ ] Communication/ticket system?

---

## MODULE 16: APPROVAL QUEUE
### Screen 16.1: Approval Queue (`/approvals`) - 308 lines
**Current State**: Pending approvals list for GM/Admin

**Your Input Needed**:
- [ ] Approval types to track?
- [ ] Multi-level approval flow?
- [ ] Email notification on pending approvals?
- [ ] Approval deadline/SLA?

---

## CROSS-CUTTING CONCERNS

### Navigation & Sidebar
**Your Input Needed**:
- [ ] Role-based menu items? (each role sees only their allowed pages?)
- [ ] Quick search across all modules?
- [ ] Breadcrumb navigation?

### Mobile & Responsive
**Your Input Needed**:
- [ ] Which screens MUST work on mobile? (Site Engineer, Client Portal?)
- [ ] PWA (installable app) for site engineers?
- [ ] Offline mode for field use?

### Reports & Export
**Your Input Needed**:
- [ ] PDF reports needed? (invoice, receipt, statement, progress?)
- [ ] Excel export on which screens?
- [ ] Print layouts?

### Integrations
**Your Input Needed**:
- [ ] Google Maps for site locations?
- [ ] WhatsApp notifications?
- [ ] Tally/accounting software export?
- [ ] Bank statement import?

---

## PRIORITIZED FIX LIST (After Your Input)

We'll work through these one-by-one, testing after each:

### Phase 1 - AUTHENTICATION (Blocker)
1. Real password login + bcrypt hashing
2. Forgot password flow (with email)
3. User invitation → password setup
4. Fix `marketing_head` role enum
5. Resend email integration

### Phase 2 - SECURITY (Before real users)
6. CORS restriction to production domain
7. Complete RBAC on all endpoints
8. Database indexes for performance
9. Session security improvements

### Phase 3 - YOUR SCREEN CHANGES
10. [Your input from above screens]
11. [Your input...]
12. [Your input...]

### Phase 4 - INTEGRATIONS
13. Google Maps API
14. Object Storage for photos/documents
15. Email notifications
16. [Your requested integrations]

### Phase 5 - MOBILE & POLISH
17. Responsive fixes for critical screens
18. PWA setup
19. Print/PDF layouts
20. Final UI polish

---

**NEXT STEP**: Review this document screen by screen. For each module, tell me:
- "OK" = no changes needed
- "CHANGES" = list what you want changed

We'll then fix one-by-one with testing after each fix.
