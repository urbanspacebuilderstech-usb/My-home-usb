# Deployment Pipeline — My Home USB Construction CRM

Last updated: Feb 12, 2026

## 1. Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────────────┐
│  Developer (E1 / AI)│ ──► │  Emergent platform (preview │
│   /app workspace    │     │   Kubernetes container)     │
└─────────┬───────────┘     │  • React (port 3000)        │
          │                 │  • FastAPI (port 8001)      │
          │                 │  • Local MongoDB             │
          │ Save to GitHub  └─────────────────────────────┘
          ▼
┌─────────────────────┐
│ GitHub repository   │
│ urbanspacebuilderstech-usb/My-home-usb
└─────────┬───────────┘
          │ git pull (manual via sshpass bash macro)
          ▼
┌─────────────────────────────────────────┐
│  Hostinger VPS (Production)             │
│  IP: 187.127.152.103                    │
│  Path: /var/www/myhomeusb/app           │
│  Frontend: Nginx serves /var/.../build  │
│  Backend: PM2 → uvicorn (port 8001)     │
│  DB: MongoDB on localhost:27017         │
│  Domain: https://www.myhomeusb.com      │
└─────────────────────────────────────────┘
```

## 2. Services & Ports

| Service  | Local (preview)        | Production (VPS)               |
|----------|------------------------|--------------------------------|
| Frontend | port 3000 (supervisor) | Nginx static files (port 443)  |
| Backend  | port 8001 (supervisor) | PM2 / uvicorn (port 8001)      |
| MongoDB  | localhost:27017        | localhost:27017                |
| Process  | supervisor             | PM2 (`pm2 list` shows `backend`)|

## 3. Database

- Engine: **MongoDB** (community, no replica set)
- Host: **localhost:27017** (same machine as backend)
- DB name: `construction_crm` (from `MONGO_URL` / `DB_NAME` in `backend/.env`)
- Collections used heavily:
  - `users`, `projects`, `payment_stages`, `additional_costs`, `addition_sections`
  - `income`, `material_expenses`, `labour_expenses`, `direct_expenses`
  - `material_requests`, `petty_cash_v2`, `petty_cash_requests`
  - `closing_balances` (Carry Forward singleton)
  - `project_carry_forwards` (per-project CF adjustments)
- No automated backup pipeline yet — recommended next step: cron `mongodump` to S3 or another VPS.

## 4. Environment Files (must not change keys)

`backend/.env`:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=construction_crm
# plus integration keys (Google Sheets OAuth, Resend, etc.)
```

`frontend/.env`:
```
REACT_APP_BACKEND_URL=https://crm-onboard-flow.preview.emergentagent.com   # preview only
# On VPS this is rebuilt with the prod URL https://www.myhomeusb.com
```

## 5. Step-by-step deploy procedure (what we do in chat)

1. **Make code changes** in `/app` (preview environment).
2. **Test locally** via supervisor (auto hot-reload). Backend smoke test with curl.
3. **User clicks "Save to GitHub" button** in the Emergent chat UI — this commits and pushes the changes from the preview Git repo (auto-managed by the platform) to the GitHub repo `urbanspacebuilderstech-usb/My-home-usb` on the `main` branch.
4. **E1 (chat agent) runs the deploy macro** on the preview container shell:

   ```bash
   sshpass -p 'MyHome@VPS2026' ssh -o StrictHostKeyChecking=no root@187.127.152.103 \
     "cd /var/www/myhomeusb/app && \
      git pull && \
      cd frontend && yarn build && \
      pm2 restart backend"
   ```

   This pulls latest commit, rebuilds the React production bundle, and restarts the backend so any Python code changes are picked up.

5. **Verify deploy** — check the bundle hash:
   ```bash
   curl -s https://www.myhomeusb.com/ | grep -oE 'main\.[a-z0-9]+\.js' | head -1
   ```
   A fresh hash confirms the new build was published.

6. **User hard-refreshes browser** (`Ctrl/Cmd + Shift + R`) to bust the cached JS bundle.

## 6. Credentials inventory (the bits we can document)

| Credential       | Where it lives                                | Notes |
|------------------|-----------------------------------------------|-------|
| VPS root password| Hostinger control panel                        | `MyHome@VPS2026` — used by sshpass macro |
| MongoDB         | Local-only on VPS, no auth set                 | Add `auth` + `mongod --auth` for prod hardening |
| Super Admin user| `db.users` collection (created via seed)       | `skmd@urbanspacebuilders.com` |
| GitHub repo     | Personal token of repo owner                   | Push happens via Emergent "Save to GitHub" button |
| Emergent account| Login at https://app.emergent.sh               | Use "Forgot password" if you've lost it — E1 has no access to user passwords |
| Universal LLM key | `EMERGENT_LLM_KEY` in `backend/.env`         | Managed by Emergent (top up via Profile > Universal Key) |

## 7. Replicating this pipeline (without Emergent)

If you ever want to move off the chat-driven deploy:

1. **CI**: GitHub Actions workflow on push to `main`:
   - SSH into VPS using a deploy key (preferred over sshpass).
   - Run the same git pull + yarn build + pm2 restart commands.
2. **Backups**: nightly cron on VPS:
   ```bash
   0 2 * * * mongodump --db construction_crm --out /backup/$(date +\%Y\%m\%d)
   ```
3. **TLS**: Already handled by Hostinger / Let's Encrypt.
4. **Reverse proxy**: Nginx (already in place). Make sure `/api/*` routes to `localhost:8001`.
5. **Monitoring**: PM2 logs (`pm2 logs backend`) + simple healthcheck endpoint `GET /api/health`.

## 8. Common gotchas observed in this project

- **"Already up to date" on git pull** — the user clicked Deploy before clicking *Save to GitHub*; the new code is still on the preview container and not on GitHub. Fix: always click **Save to GitHub** before each deploy.
- **Browser caches the JS bundle aggressively** — even after deploy, the user must hard-refresh (Ctrl/Cmd + Shift + R) to load the new bundle.
- **MongoDB field names vary** — some collections use `qty / price / estimated_amount`, others `quantity / unit_rate / amount`. Always inspect a sample doc before writing queries.
- **No replica set** — `transactions` aren't supported. Use single-document atomic updates only.
