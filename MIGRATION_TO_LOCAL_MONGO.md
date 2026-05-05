# Migration: MongoDB Atlas → Local MongoDB on Hostinger VPS

## Why
Production currently points to MongoDB Atlas (cloud). Each query takes ~240ms
because it crosses the public internet from your VPS to Atlas. Switching to
the local MongoDB already installed on the VPS drops that to ~5ms — typically
**5x faster overall app loading**.

## Pre-flight on the VPS

```bash
ssh root@<your-vps-ip>

# 1. Confirm local MongoDB 7 is running
sudo systemctl status mongod
# Should show "active (running)". If not:
#   sudo systemctl enable --now mongod

# 2. Confirm it's on the default port
sudo ss -tlnp | grep 27017
# Should show 127.0.0.1:27017 LISTEN

# 3. Confirm you can connect
mongosh --eval "db.runCommand({ping:1})"
# Should print { ok: 1 }
```

## Run the migration (data copy from Atlas → local)

```bash
cd /var/www/myhomeusb/backend   # adjust path to wherever your backend lives
source venv/bin/activate         # if you use venv, otherwise skip

# Pull the latest code (which includes the new migration script)
cd ..
git pull origin main
cd backend

# Find your CURRENT Atlas URL from the existing .env
ATLAS_URL=$(grep MONGO_URL .env | cut -d '=' -f2-)
echo "Source: $ATLAS_URL"

# Run the migration (replace --db if your DB name is different)
python scripts/migrate_atlas_to_local.py \
    --source "$ATLAS_URL" \
    --target "mongodb://localhost:27017" \
    --db construction_crm
```

You'll see progress like:
```
✓ Connected to source: mongodb+srv://...
✓ Found 32 collections to migrate:
  • users: 26 docs ✓
  • projects: 14 docs ✓
  • leads: 287 docs ✓
  ...
✓ Migration complete. 1,847 documents copied.
```

## Switch the live config

```bash
# Backup the current .env
cp /var/www/myhomeusb/backend/.env /var/www/myhomeusb/backend/.env.atlas.bak

# Edit MONGO_URL — change ONLY this line
nano /var/www/myhomeusb/backend/.env
# Change:
#   MONGO_URL=mongodb+srv://urbanspacebuilderstech_db_user:....mongodb.net/...
# To:
#   MONGO_URL=mongodb://localhost:27017
# (leave DB_NAME=construction_crm unchanged)

# Restart backend (frontend doesn't care)
pm2 restart all --update-env
pm2 save

# Verify backend came up healthy
pm2 logs backend --lines 30
```

## Smoke test

1. Open https://www.myhomeusb.com → log in.
2. Open Planning Board → All Projects → switch tabs (New / Current / Delivered / Archive).
   They should now load **noticeably faster** (~50-150ms each, vs ~1s before).
3. Open Pre-Sales / Sales boards → counts and lead lists should load instantly.
4. Create a new lead → verify it persists.

## Rollback (if anything goes wrong)

```bash
# Restore the Atlas URL
cp /var/www/myhomeusb/backend/.env.atlas.bak /var/www/myhomeusb/backend/.env
pm2 restart all --update-env
```

## Cleanup (after 1 week of stable local-Mongo operation)

- Delete the Atlas cluster (or downgrade to a free M0 as cold backup).
- Delete `.env.atlas.bak` from the VPS.
- Schedule daily local Mongo backup:
  ```bash
  # Add to crontab: mongodump nightly
  0 2 * * * /usr/bin/mongodump --db construction_crm --out /var/backups/mongo/$(date +\%F) >/dev/null 2>&1
  # And prune old backups beyond 14 days:
  5 2 * * * find /var/backups/mongo -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
  ```
