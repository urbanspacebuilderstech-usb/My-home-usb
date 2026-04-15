#!/bin/bash
# ============================================
# Step 2: Clone repo & install dependencies
# ============================================

echo "========================================="
echo "  Step 2: Clone & Install"
echo "========================================="

# Clone your GitHub repo
cd /var/www/myhomeusb
echo "Enter your GitHub repo URL (e.g., https://github.com/yourusername/yourrepo.git):"
read GITHUB_REPO
git clone $GITHUB_REPO app
cd app

# Setup Backend
echo "[1/3] Setting up Backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate
cd ..

# Setup Frontend
echo "[2/3] Setting up Frontend..."
cd frontend
yarn install
yarn build
cd ..

echo "[3/3] Setup complete!"
echo ""
echo "Next: Run setup_step3.sh to configure environment"
