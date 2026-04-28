# Production Deployment — Hostinger VPS (www.myhomeusb.com)

## One-time setup (do this ONCE — ~5 minutes)

### Step 1 — Generate a deploy SSH key on the VPS
SSH into the VPS manually ONE last time:
```bash
ssh root@187.127.152.103
ssh-keygen -t ed25519 -f ~/.ssh/github-deploy -N ""     # empty passphrase
cat ~/.ssh/github-deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github-deploy      # copy this PRIVATE key — you'll paste into GitHub
```
Keep that private key on screen for the next step.

### Step 2 — Add secrets to GitHub
Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Add these 5 secrets:

| Name           | Value                                         |
|----------------|-----------------------------------------------|
| `VPS_HOST`     | `187.127.152.103`                             |
| `VPS_USER`     | `root` (or whichever user runs `pm2`)         |
| `VPS_PORT`     | `22` (skip if default)                        |
| `VPS_SSH_KEY`  | The full private key from Step 1 (BEGIN...END)|
| `VPS_APP_PATH` | The path where you `git clone`d the repo, e.g. `/root/app` or `/home/ubuntu/app`. Run `pm2 list` on the VPS to see the `cwd` column. |

### Step 3 — Done. Test it.
- Click **Save to GitHub** in Emergent → pushes to `main`.
- GitHub Actions runs `.github/workflows/deploy-production.yml` which SSHs in, pulls, builds, and restarts PM2 (~90 seconds).
- Watch progress at `https://github.com/<your-user>/<your-repo>/actions`.
- Visit `https://www.myhomeusb.com` incognito → changes live.

---

## Day-to-day deploy (from now on)
1. Main agent (me) makes changes in Emergent preview.
2. You click **Save to GitHub**.
3. GitHub Action auto-deploys. That's it.

If the workflow fails, the Actions tab shows you the exact shell error (usually a missing secret or wrong `VPS_APP_PATH`).

## Manual deploy (fallback, if Actions fails)
```bash
ssh root@187.127.152.103
cd $VPS_APP_PATH
git pull
cd frontend && yarn build
pm2 restart all
```
