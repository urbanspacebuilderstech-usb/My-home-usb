# My Home USB — Hostinger VPS Deployment Guide

## Your VPS Details
- **IP:** 187.127.152.103
- **Domain:** www.myhomeusb.com
- **OS:** Ubuntu

---

## Step-by-Step Instructions

### Step 1: Connect to VPS
Open terminal on your computer (Mac Terminal / Windows PowerShell) and run:
```bash
ssh root@187.127.152.103
```
Enter password when prompted: `x;T4Q.k3-+(vs/D?`

---

### Step 2: Install Everything (Run on VPS)
Copy-paste these commands ONE BY ONE:

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn pm2

# Install Python
apt install -y python3 python3-pip python3-venv

# Install MongoDB 7.0
apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update
apt install -y mongodb-org
systemctl start mongod
systemctl enable mongod

# Install Nginx & Certbot
apt install -y nginx certbot python3-certbot-nginx git
systemctl start nginx
systemctl enable nginx

# Create app directory
mkdir -p /var/www/myhomeusb/uploads
```

---

### Step 3: Clone Your Code (Run on VPS)
```bash
cd /var/www/myhomeusb
git clone YOUR_GITHUB_REPO_URL app
cd app
```
Replace `YOUR_GITHUB_REPO_URL` with your actual GitHub repo link.

---

### Step 4: Install Backend Dependencies
```bash
cd /var/www/myhomeusb/app/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate
```

---

### Step 5: Install Frontend & Build
```bash
cd /var/www/myhomeusb/app/frontend
yarn install
```

---

### Step 6: Configure Environment Files

**Backend .env:**
```bash
cat > /var/www/myhomeusb/app/backend/.env << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=construction_crm
CORS_ORIGINS=https://myhomeusb.com,https://www.myhomeusb.com
RESEND_API_KEY=re_fD9YsUuS_NUYABqcaqYovF6ywtcXN2p5v
SENDER_EMAIL=noreply@myhomeusb.com
GOOGLE_SHEETS_CLIENT_ID=748540168783-0vsq4om3nli1gaitb9lpjgmrrd080emh.apps.googleusercontent.com
GOOGLE_SHEETS_CLIENT_SECRET=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
GOOGLE_SHEETS_REDIRECT_URI=https://www.myhomeusb.com/api/oauth/sheets/callback
FRONTEND_URL=https://www.myhomeusb.com
DEMO_MODE=false
EOF
```

**Frontend .env:**
```bash
cat > /var/www/myhomeusb/app/frontend/.env << 'EOF'
REACT_APP_BACKEND_URL=https://www.myhomeusb.com
EOF
```

**Build Frontend:**
```bash
cd /var/www/myhomeusb/app/frontend
yarn build
```

---

### Step 7: Configure Nginx

```bash
cat > /etc/nginx/sites-available/myhomeusb << 'EOF'
server {
    listen 80;
    server_name myhomeusb.com www.myhomeusb.com;

    client_max_body_size 50M;

    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    location /oauth {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /var/www/myhomeusb/app/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /uploads {
        alias /var/www/myhomeusb/uploads;
    }
}
EOF

ln -sf /etc/nginx/sites-available/myhomeusb /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

### Step 8: Point Domain DNS
Go to your domain registrar and set:
```
Type: A    Name: @    Value: 187.127.152.103
Type: A    Name: www  Value: 187.127.152.103
```
Wait 5-10 minutes for DNS to propagate.

---

### Step 9: Setup SSL (HTTPS)
After DNS is pointed:
```bash
certbot --nginx -d myhomeusb.com -d www.myhomeusb.com --agree-tos --email admin@myhomeusb.com
```

---

### Step 10: Start the App

```bash
cd /var/www/myhomeusb/app

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: '/var/www/myhomeusb/app/backend',
      script: 'venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8001',
      interpreter: 'none',
      env: {
        PATH: '/var/www/myhomeusb/app/backend/venv/bin:' + process.env.PATH
      },
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
};
EOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

### Step 11: Migrate Data from MongoDB Atlas

```bash
# Install MongoDB tools
apt install -y mongodb-database-tools 2>/dev/null || {
    wget -q https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.10.0.deb
    dpkg -i mongodb-database-tools-ubuntu2204-x86_64-100.10.0.deb
    rm mongodb-database-tools-ubuntu2204-x86_64-100.10.0.deb
}

# Export from Atlas
mkdir -p /tmp/mongo_backup
mongodump --uri="mongodb+srv://urbanspacebuilderstech_db_user:BwrIZOO1GfTYGIbW@constructioncrm.l86s93a.mongodb.net/construction_crm" --out=/tmp/mongo_backup

# Import to local MongoDB
mongorestore --db=construction_crm /tmp/mongo_backup/construction_crm

# Verify
mongosh construction_crm --eval 'db.stats()'

# Cleanup
rm -rf /tmp/mongo_backup
```

---

## Useful Commands (After Setup)

| Command | What it does |
|---------|-------------|
| `pm2 status` | Check if app is running |
| `pm2 logs backend` | View backend logs |
| `pm2 restart backend` | Restart backend |
| `systemctl status nginx` | Check Nginx status |
| `systemctl status mongod` | Check MongoDB status |
| `certbot renew` | Renew SSL certificate |

## To Redeploy After Changes:
```bash
cd /var/www/myhomeusb/app
git pull
cd frontend && yarn build
cd ..
pm2 restart backend
```
