#!/bin/bash
# ============================================
# Step 6: Start the App with PM2
# ============================================

echo "========================================="
echo "  Step 6: Starting Application"
echo "========================================="

APP_DIR="/var/www/myhomeusb/app"

# Create PM2 ecosystem config
cat > $APP_DIR/ecosystem.config.js << 'PM2CONFIG'
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
PM2CONFIG

# Build frontend for production
cd $APP_DIR/frontend
yarn build

# Start backend with PM2
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "========================================="
echo "  App is running!"
echo "  Backend: http://localhost:8001"
echo "  Frontend: Served by Nginx from build/"
echo "  Check: pm2 status"
echo "  Logs: pm2 logs backend"
echo "========================================="
echo ""
echo "Next: Run setup_step7.sh to migrate data from MongoDB Atlas"
