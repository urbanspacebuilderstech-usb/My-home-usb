#!/bin/bash
# ============================================
# Step 3: Configure Environment Variables
# ============================================

echo "========================================="
echo "  Step 3: Configure Environment"
echo "========================================="

APP_DIR="/var/www/myhomeusb/app"

# Backend .env
# SECURITY: do not hardcode real secrets in this tracked script. Fill in the
# placeholders below by hand on the server (or export them as shell vars
# before running this script), then this heredoc will substitute them in.
cat > $APP_DIR/backend/.env << ENVFILE
MONGO_URL=mongodb://localhost:27017
DB_NAME=construction_crm
CORS_ORIGINS=https://myhomeusb.com,https://www.myhomeusb.com
RESEND_API_KEY=${RESEND_API_KEY:?Set RESEND_API_KEY in your shell before running this script}
SENDER_EMAIL=noreply@myhomeusb.com
GOOGLE_SHEETS_CLIENT_ID=${GOOGLE_SHEETS_CLIENT_ID:?Set GOOGLE_SHEETS_CLIENT_ID in your shell before running this script}
GOOGLE_SHEETS_CLIENT_SECRET=${GOOGLE_SHEETS_CLIENT_SECRET:?Set GOOGLE_SHEETS_CLIENT_SECRET in your shell before running this script}
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
