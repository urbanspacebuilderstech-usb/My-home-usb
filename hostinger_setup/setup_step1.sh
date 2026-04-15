#!/bin/bash
# ============================================
# My Home USB - Hostinger VPS Setup Script
# Run this on your VPS after SSH login
# ============================================

echo "========================================="
echo "  My Home USB - VPS Setup Starting..."
echo "========================================="

# Step 1: Update system
echo "[1/8] Updating system..."
apt update && apt upgrade -y

# Step 2: Install Node.js 20
echo "[2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn pm2

# Step 3: Install Python 3.11+
echo "[3/8] Installing Python..."
apt install -y python3 python3-pip python3-venv

# Step 4: Install MongoDB 7.0
echo "[4/8] Installing MongoDB..."
apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update
apt install -y mongodb-org
systemctl start mongod
systemctl enable mongod

# Step 5: Install Nginx
echo "[5/8] Installing Nginx..."
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# Step 6: Install Certbot for SSL
echo "[6/8] Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# Step 7: Install Git
echo "[7/8] Installing Git..."
apt install -y git

# Step 8: Create app directory
echo "[8/8] Creating app directory..."
mkdir -p /var/www/myhomeusb
mkdir -p /var/www/myhomeusb/uploads

echo "========================================="
echo "  Base setup complete!"
echo "  Node: $(node -v)"
echo "  Python: $(python3 --version)"
echo "  MongoDB: $(mongod --version | head -1)"
echo "  Nginx: $(nginx -v 2>&1)"
echo "========================================="
echo ""
echo "Next: Run setup_step2.sh"
