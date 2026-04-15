#!/bin/bash
# ============================================
# Step 4: Configure Nginx reverse proxy
# ============================================

echo "========================================="
echo "  Step 4: Nginx Configuration"
echo "========================================="

# Create Nginx config
cat > /etc/nginx/sites-available/myhomeusb << 'NGINX'
server {
    listen 80;
    server_name myhomeusb.com www.myhomeusb.com;

    client_max_body_size 50M;

    # Backend API
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
        proxy_send_timeout 120s;
    }

    # OAuth callback
    location /oauth {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend (React build)
    location / {
        root /var/www/myhomeusb/app/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Static uploads
    location /uploads {
        alias /var/www/myhomeusb/uploads;
    }
}
NGINX

# Enable site
ln -sf /etc/nginx/sites-available/myhomeusb /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Reload nginx
systemctl reload nginx

echo "Nginx configured!"
echo ""
echo "Next: Point your domain DNS to this VPS IP, then run setup_step5.sh for SSL"
