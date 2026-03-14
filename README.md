# ConstructionOS - Construction Accounting CRM & Project Operations System

A comprehensive, role-based construction project management system built with FastAPI, React, and MongoDB.

## 🎯 Overview

ConstructionOS replaces Excel, WhatsApp, and manual approvals by managing:
- Project creation & costing (BOQ)
- Department-wise workflows
- Work order approvals
- Procurement & vendor management
- Site material receipt with GPS & images
- Expense & accounting automation
- Real-time dashboards
- Secure client transparency portal

## 👥 User Roles

The system supports 8 distinct roles with strict permissions:

1. **Super Admin** - Full system access, user management, all dashboards
2. **Accountant** - Work order approvals/rejections, expense management
3. **Project Manager** - Project creation, work order submission
4. **Planning Department** - BOQ creation and management
5. **Procurement Department** - Purchase order creation, vendor assignment
6. **Site Engineer** - Site receipt submission with GPS & images
7. **Vendor** - View assigned orders, update dispatch details
8. **Client** - Read-only access to their project portal

## 🔐 Demo Credentials

Use Google OAuth with these demo emails:

| Role | Email |
|------|-------|
| Super Admin | admin@constructionos.com |
| Accountant | accountant@constructionos.com |
| Project Manager | pm@constructionos.com |
| Planning | planning@constructionos.com |
| Procurement | procurement@constructionos.com |
| Site Engineer | engineer@constructionos.com |
| Client | raj@client.com |

## 📊 Demo Data Pre-loaded

**Project: Classic Condo** (₹60,00,000)
- Client: Mr. Raj  
- Location: Perumbakkam, Chennai
- Status: Active

**BOQ Items:**
- Sand: 10 Loads @ ₹18,000 = ₹1,80,000
- Cement: 500 Bags @ ₹420 = ₹2,10,000  
- Steel: 5 Tons @ ₹65,000 = ₹3,25,000
- Labour: 100 Days @ ₹800 = ₹80,000

**Work Order:** wo_sand001 (Submitted, awaiting approval)

**Vendor:** Sri Balaji Sand Suppliers

**Payments:** ₹25,00,000 paid | ₹35,00,000 balance

## 🔄 Complete Workflow

1. **Planning** creates BOQ items (budget)
2. **Project Manager** creates work order
3. **Accountant** approves work order
4. **Procurement** creates purchase order, assigns vendor
5. **Site Engineer** captures GPS + images, submits receipt
6. System auto-creates expense, updates dashboard
7. **Client** views progress in portal

## 🎨 Design Features

- Yellow (#FFD700) + White + Black color theme
- Industrial/Construction aesthetic  
- Mobile-optimized for site engineers
- Large touch targets (GPS button h-14)
- Professional Manrope & Inter fonts

## 🚀 Live URLs

- Frontend: https://crm-workflow-v2.preview.emergentagent.com
- Backend API: https://crm-workflow-v2.preview.emergentagent.com/api

## 📝 Key Files

- `/app/backend/server.py` - FastAPI backend with all endpoints
- `/app/backend/seed_database.py` - Demo data seeder
- `/app/frontend/src/App.js` - React router and auth
- `/app/frontend/src/pages/` - All page components
- `/app/design_guidelines.json` - Design system specs
- `/app/auth_testing.md` - Testing guide

## ⚙️ Tech Stack

**Backend:** FastAPI, Motor (MongoDB), GridFS, Resend  
**Frontend:** React 19, Tailwind CSS, Shadcn/UI  
**Auth:** Emergent Google OAuth  
**Database:** MongoDB with GridFS for images

---

**Built for Construction Industry** 🏗️
