#!/bin/bash
# ============================================
# Step 5: SSL Certificate (run after DNS is pointed)
# ============================================

echo "========================================="
echo "  Step 5: SSL Certificate Setup"
echo "========================================="

echo "Make sure your domain DNS A record points to this VPS IP first!"
echo "Press Enter to continue..."
read

certbot --nginx -d myhomeusb.com -d www.myhomeusb.com --non-interactive --agree-tos --email admin@myhomeusb.com

echo "SSL setup complete!"
echo ""
echo "Next: Run setup_step6.sh to start the app"
