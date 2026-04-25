# Security Audit Report — Construction CRM API
**Date:** April 2026 | **Total Endpoints:** 633 across 13 route files

---

## CRITICAL (Fix Before Production)

### 1. `/api/auth/demo-login` — Full Account Takeover (No Password Required)
- **Risk:** CRITICAL
- **File:** `auth.py:308`
- **Issue:** Anyone can log in as ANY user (Super Admin, Accountant, etc.) by simply providing an email. No password needed.
- **Attack:** `curl -X POST /api/auth/demo-login -d '{"email":"urbanspacebuilderstech@gmail.com"}'` → Full Super Admin access
- **Fix:** Disable or remove this endpoint entirely in production. Add environment flag `DEMO_MODE=false`.

### 2. `/api/files/upload` — Unauthenticated File Upload
- **Risk:** CRITICAL
- **File:** `files.py:22`
- **Issue:** No authentication check (`get_current_user` missing). Anyone can upload files to your storage.
- **Attack:** Attacker uploads malicious files, fills storage, or uses server as file hosting.
- **Fix:** Add `user: User = Depends(get_current_user)` to the endpoint.

### 3. `/api/files/{file_id}/download` — Unauthenticated File Access
- **Risk:** CRITICAL
- **File:** `files.py:74`
- **Issue:** Any file can be downloaded by anyone who guesses or enumerates file IDs.
- **Attack:** Iterate through file IDs to download sensitive project documents, receipts, contracts.
- **Fix:** Add authentication + verify the requesting user has access to the file's project.

### 4. `/api/site-photos/upload` and `/api/documents/upload` — Unauthenticated
- **Risk:** CRITICAL
- **File:** `projects.py:617, 661`
- **Issue:** No auth check. Anyone can upload photos/documents to any project.
- **Fix:** Add `Depends(get_current_user)` + project access validation.

---

## HIGH (Fix Within 1 Week)

### 5. `/api/auth/initial-setup` — Can Create New Super Admins
- **Risk:** HIGH
- **File:** `auth.py:116`
- **Issue:** Not protected by auth. Only checks if email exists, not if setup was already done. An attacker can create additional super admin accounts with new emails.
- **Fix:** Add a one-time flag in DB. If any super_admin exists, block this endpoint.

### 6. 26+ Endpoints Missing Authentication
- **Risk:** HIGH
- **Files:** Multiple (see list below)
- **Issue:** These endpoints expose sensitive business data without requiring login:
  - `/api/crm/pre-sales/leads` — All pre-sales leads
  - `/api/crm/sales/leads` — All sales leads
  - `/api/income` — Financial income data
  - `/api/cre/projects/all` — All projects
  - `/api/planning/projects-filtered` — Filtered projects
  - `/api/work-orders` — All work orders
  - `/api/accountant/transactions` — Financial transactions
  - `/api/financial/audit-logs` — System audit logs
  - `/api/financial/indirect-cost-categories` — Cost categories
  - `/api/labour-attendance` — Attendance records
  - `/api/site-receipts/image/{file_id}` — Receipt images
  - `/api/site-engineer/material-requests/{id}/approve` — Material approval
  - `/api/material-requests/{id}/planning-action` — Planning actions
  - `/api/procurement/transit/{id}/update` — Transit updates
  - `/api/accountant/payment-request/initiate` — Payment initiation
- **Fix:** Add `user: User = Depends(get_current_user)` to ALL these endpoints.

### 7. No File Type/Size Validation on Upload
- **Risk:** HIGH
- **File:** `files.py:22`
- **Issue:** No check on file extension, MIME type, or file size. Attacker can upload .exe, .php, extremely large files.
- **Fix:** Add file size limit (e.g., 50MB), whitelist allowed extensions (.pdf, .jpg, .png, .xlsx, .docx).

### 8. Rate Limiting Only on Login
- **Risk:** HIGH
- **File:** `auth.py`
- **Issue:** Rate limiting exists only on `/auth/login` and `/auth/demo-login`. All other endpoints are unlimited.
- **Attack:** Brute force OTP codes, spam file uploads, DoS on expensive DB queries.
- **Fix:** Add global rate limiting middleware (e.g., 100 req/min per IP for all endpoints).

---

## MEDIUM (Fix Within 2 Weeks)

### 9. OTP Brute Force — No Attempt Limiting
- **Risk:** MEDIUM
- **File:** `auth.py:985`
- **Issue:** `/api/auth/verify-otp-reset-password` has no rate limiting. 6-digit OTP can be brute-forced (1M combinations).
- **Fix:** Limit to 5 attempts per OTP, then invalidate. Add cooldown between attempts.

### 10. Password Reset Token Not Time-Expired on Server
- **Risk:** MEDIUM
- **File:** `auth.py:428`
- **Issue:** Forgot password tokens should have strict expiry checked server-side.
- **Fix:** Verify `expires_at > now()` in the reset-password handler.

### 11. No Role-Based Access on Many Endpoints
- **Risk:** MEDIUM
- **Files:** Multiple
- **Issue:** Some endpoints check auth but not role. A Site Engineer could potentially access Accountant or Super Admin endpoints.
- **Fix:** Add role checks on sensitive operations (financial, user management, project deletion).

### 12. Regex Injection in Search/Filter
- **Risk:** MEDIUM
- **File:** `packages.py:67`
- **Issue:** `{"$regex": f"^{data.name}$"}` — User input directly in regex without escaping.
- **Attack:** Crafted regex can cause ReDoS (Regular Expression Denial of Service).
- **Fix:** Use `re.escape()` on all user inputs used in `$regex`.

### 13. CORS Allows Multiple Origins Including Wildcards
- **Risk:** MEDIUM
- **File:** `server.py:118`
- **Issue:** CORS includes dynamic Cloudflare cluster patterns. In production, restrict to exact production domain only.
- **Fix:** Set `CORS_ORIGINS` to only your production domain.

---

## LOW (Best Practices)

### 14. No HTTPS Enforcement
- **Issue:** No middleware forcing HTTPS redirect.
- **Fix:** Add HSTS header and HTTPS-only cookies.

### 15. Session Tokens in Cookies Without `__Host-` Prefix
- **Issue:** Cookie security could be improved with `__Host-` prefix for additional protection.

### 16. No Request Body Size Limit
- **Issue:** Large POST bodies could cause memory issues.
- **Fix:** Add body size limit middleware (e.g., 10MB max).

### 17. Audit Logs Accessible Without Auth
- **Issue:** `/api/financial/audit-logs` exposes security-sensitive audit trail.
- **Fix:** Restrict to Super Admin only.

---

## Priority Fix Order for Production

| Priority | Action | Time |
|----------|--------|------|
| 1 | Disable `/api/auth/demo-login` | 5 min |
| 2 | Add auth to file upload/download endpoints | 30 min |
| 3 | Add auth to all 26 unprotected endpoints | 2 hours |
| 4 | Lock `/api/auth/initial-setup` after first admin | 15 min |
| 5 | Add file size/type validation | 30 min |
| 6 | Add global rate limiting | 1 hour |
| 7 | Add OTP attempt limiting | 30 min |
| 8 | Fix regex injection in search | 15 min |
| 9 | Restrict CORS to production domain | 5 min |
| 10 | Add role-based access checks | 2 hours |

---

**Total Critical Issues:** 4
**Total High Issues:** 4
**Total Medium Issues:** 5
**Total Low Issues:** 4
