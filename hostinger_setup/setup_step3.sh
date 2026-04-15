#!/bin/bash
# ============================================
# Step 3: Configure Environment Variables
# ============================================

echo "========================================="
echo "  Step 3: Configure Environment"
echo "========================================="

APP_DIR="/var/www/myhomeusb/app"

# Backend .env
cat > $APP_DIR/backend/.env << 'ENVFILE'
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
ENVFILE

# Frontend .env
cat > $APP_DIR/frontend/.env << 'ENVFILE'
REACT_APP_BACKEND_URL=https://www.myhomeusb.com
ENVFILE

echo "Environment files created!"
echo ""
echo "Backend .env:"
cat $APP_DIR/backend/.env
echo ""
echo "Frontend .env:"
cat $APP_DIR/frontend/.env
echo ""
echo "Next: Run setup_step4.sh to configure Nginx"
