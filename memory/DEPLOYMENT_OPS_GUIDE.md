# MyHomeUSB CRM — Deployment & Operations Guide

_VPS setup, env vars, deploy macro, troubleshooting, monitoring._

---

## 1. Infrastructure

| Layer | Component | Where |
|-------|----------|-------|
| Host | Hostinger VPS | `187.127.152.103` |
| OS | Ubuntu 22.04 | — |
| Webserver | Nginx | Listens on 80/443; reverse-proxies `/api` → 8001 |
| Process manager | PM2 | Manages `backend` (FastAPI / uvicorn) |
| Static | Nginx serves React build | `/var/www/myhomeusb/app/frontend/build` |
| DB | MongoDB | local on VPS, default port 27017 |
| TLS | Let's Encrypt | auto-renew via certbot |

### Folder layout on VPS
```
/var/www/myhomeusb/app/
  ├── backend/        FastAPI app
  │   ├── routes/
  │   ├── core/
  │   └── server.py
  ├── frontend/
  │   ├── src/
  │   └── build/      Production bundle
  ├── .env (root)     Shared env (not used at runtime)
  ├── backend/.env    MONGO_URL, DB_NAME, JWT_SECRET, API keys
  └── frontend/.env   REACT_APP_BACKEND_URL=https://myhomeusb.com
```

---

## 2. Environment Variables

### `backend/.env` (required)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=myhomeusb
JWT_SECRET_KEY=<random>
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=4320
RESEND_API_KEY=<resend key, optional>
GOOGLE_SHEETS_OAUTH_CREDS=<path to credentials.json, optional>
```

### `frontend/.env`
```
REACT_APP_BACKEND_URL=https://myhomeusb.com
```

> **Never edit MONGO_URL/DB_NAME, REACT_APP_BACKEND_URL keys directly.** They're considered protected. No defaults / fallbacks — missing values must fail fast.

---

## 3. Deploy Pipeline (GitHub Actions — since Jul 2026)

**Primary method**: push to `main` (user clicks **Save to GitHub**) → `.github/workflows/deploy-production.yml` auto-runs:
1. Builds frontend **on the GitHub runner** (7GB RAM — VPS was OOM-killing `yarn build` with signal 9).
2. Bakes `REACT_APP_BACKEND_URL=https://myhomeusb.com` into the build.
3. SSHes to VPS (secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`, `VPS_APP_PATH`): `git reset --hard origin/main` + `pip install`.
4. SCPs `frontend/build/` to `/var/www/myhomeusb/app/frontend/build`.
5. Restores prod `frontend/.env`, ensures 2G swapfile, `pm2 restart all`.

**NEVER run `yarn build` on the VPS** — it gets OOM-killed (signal 9).

### Fallback: agent SSH (root password: `USP.K55.@vin` as of Jul 2026)
```bash
sshpass -p 'USP.K55.@vin' ssh -o StrictHostKeyChecking=no root@187.127.152.103 "<command>"
```
Note: password auth was failing from agent container on 14-Jul-2026 even with the new password — GH Actions SSH key is the reliable path.

After deploy:
- Verify the new commit hash matches expectations: `git log -n 1 --oneline`.
- **Hard-refresh** browser (Ctrl+Shift+R) to bust JS cache.

---

## 4. PM2 Commands

```bash
pm2 ls                 # list managed processes
pm2 logs backend       # tail backend logs
pm2 restart backend    # graceful restart
pm2 stop backend       # stop
pm2 start backend      # start (uses ecosystem.config.js)
```

`pm2-logrotate` is enabled — logs rotate at 10 MB, retained for 30 days.

---

## 5. Nginx Configuration

`/etc/nginx/sites-enabled/myhomeusb.com`:

```nginx
server {
  listen 443 ssl http2;
  server_name myhomeusb.com;
  ssl_certificate /etc/letsencrypt/live/myhomeusb.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/myhomeusb.com/privkey.pem;

  client_max_body_size 50M;

  # API → FastAPI
  location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 90s;
  }

  # SPA fallback
  location / {
    root /var/www/myhomeusb/app/frontend/build;
    try_files $uri $uri/ /index.html;
  }
}

server {
  listen 80;
  server_name myhomeusb.com;
  return 301 https://$host$request_uri;
}
```

Reload after edits:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. MongoDB

### Backup
```bash
mongodump --uri="mongodb://localhost:27017" --db=myhomeusb --gzip --archive=/backups/$(date +%F).gz
```
Recommended: cron job nightly + offsite copy to S3.

### Restore
```bash
mongorestore --uri="mongodb://localhost:27017" --gzip --archive=/backups/2026-02-15.gz
```

### Indexes (recommended)
```
db.users.createIndex({email:1}, {unique:true})
db.projects.createIndex({project_id:1}, {unique:true})
db.projects.createIndex({status:1, created_at:-1})
db.project_work_orders.createIndex({project_id:1, work_order_id:1}, {unique:true})
db.cheques.createIndex({status:1, cheque_date:-1})
db.cashbook.createIndex({project_id:1, payment_date:-1})
db.notifications.createIndex({user_id:1, is_read:1, created_at:-1})
db.material_requests.createIndex({project_id:1, status:1})
db.labour_expenses.createIndex({project_id:1, status:1})
```

---

## 7. Troubleshooting Playbook

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| 502 Bad Gateway | Backend not running | `pm2 restart backend`; check `pm2 logs backend` for tracebacks |
| 504 Gateway Timeout | Slow Mongo query | Inspect query, add index, increase `proxy_read_timeout` |
| White screen on frontend | Stale JS bundle | Hard-refresh (Ctrl+Shift+R); rebuild + redeploy |
| "Insufficient permissions" | Role mismatch | Check `users.role`, log in/out, verify JWT contains role |
| Cheques showing "-" project | Pre-Feb-2026 row | API now backfills via project lookup — restart backend to pick up code change |
| RAB stuck "Pending PM" | PM hasn't acted | Check PM Approvals queue or notifications |
| "Cannot delete stage" | Stage has RAB | Reject/delete RAB first, then delete stage |
| "Unlock the section first" | Section locked | Toggle section unlock before touching item lock |
| Section visible on SE but not on Planning | Different `claim_type` filter | Planning's filter now matches `rework_se` + legacy `rework`; redeploy |
| Multi-stage bill releases as two payments | Backend missing `sibling_request_ids` | Verify latest backend (Feb 2026 `accountant_release_labour_payment`) |
| Cashbook reversal needed | Wrong release | Super Admin only; use audit log to find the entry |

---

## 8. Monitoring & Alerts

| Metric | Tool | Threshold |
|--------|------|-----------|
| Backend uptime | PM2 + uptime-kuma | ≤ 99.5% triggers alert |
| Mongo disk usage | df + cron | > 80% → alert |
| Suspicious logins | Audit log | > 5 failed in 5min → email Super Admin |
| Cheque bounce rate | Daily cron | > 2% → email GM |
| Backend error rate | logs grep | > 1% 5xx → page Super Admin |

---

## 9. Public Documents (Architecture / Manuals)

After `yarn build`, these are served at:
- `https://myhomeusb.com/MyHomeUSB_System_Architecture.pdf`
- `https://myhomeusb.com/MyHomeUSB_User_Role_Manual.pdf`
- `https://myhomeusb.com/MyHomeUSB_Business_Flow.pdf`
- `https://myhomeusb.com/MyHomeUSB_API_Reference.pdf`
- `https://myhomeusb.com/MyHomeUSB_Deployment_Guide.pdf`

(Markdown counterparts also available at `https://myhomeusb.com/MyHomeUSB_*.md`.)

---

## 10. Routine Maintenance Schedule

| Frequency | Task |
|-----------|------|
| Daily | Mongo backup + offsite sync |
| Daily | Cheque bounce rate check |
| Weekly | Log rotation review |
| Weekly | Index health (db.collection.getIndexes()) |
| Monthly | Patch OS (sudo apt update && upgrade) |
| Monthly | Renew Let's Encrypt (auto, verify on 1st) |
| Quarterly | Restore-test from backup |
| Yearly | JWT secret rotation (force re-login) |

_End of ops guide._
