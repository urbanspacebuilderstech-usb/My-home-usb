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
- [x] **RNR Stage** added to Pre-Sales pipeline (Mar 9, 2026)
- [x] **Pipeline Stage Management** - Full CRUD for Pre-Sales & Sales stages (Mar 9, 2026)
  - StageManagement page at /settings/stages
  - Add, edit, delete, reorder stages with color picker & is_final flag
  - Settings Quick Links for Pre-Sales & Sales Stages
  - "Manage Stages" button in CRMPreSales & CRMSales (Super Admin only)
- [x] **Pre-Sales → Sales transfer fix** (Mar 9, 2026)
  - Removed hardcoded `stage["name"] == "Appointment Booked"` check
  - Now triggers on any `is_final` pre-sales stage
  - Added double-transfer prevention
  - Added 'sem', 'social_media', 'direct' to LeadSource enum
- [x] **CRE Payment Collection → Accountant Approval fix** (Mar 9, 2026)
  - Payment collections now create income with `status: "pending_approval"`
  - Deal conversion advance payments now also create income records for approval
  - Full approve/reject flow working in Accountant's Approvals tab

## Credentials
- All demo users: password `Demo@1234`
- Super Admin: `admin@constructionos.com`
- Accountant: `accountant@constructionos.com`
- CRE: `cre@constructionos.com`
- Production Super Admin: `urbanspacebuilderstech@gmail.com` (use Forgot Password)

## Key API Endpoints
- `GET /api/approvals/unified` - All pending approvals
- `POST /api/approvals/income/{id}/approve` - Approve income
- `POST /api/approvals/income/{id}/reject` - Reject income
- `POST /api/payment-stages/{id}/collect` - CRE collects payment (creates pending_approval income)
- `GET /api/crm/stages/with-counts` - Stages with lead counts (Super Admin)
- `POST/PATCH/DELETE /api/crm/stages` - Stage CRUD

## Backlog
- [ ] Gantt Chart for project timelines (P1)
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review continuation (other pages responsive)
- [ ] Production deployment guidance
