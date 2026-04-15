#!/bin/bash
# ============================================
# Step 7: Migrate Data from MongoDB Atlas
# ============================================

echo "========================================="
echo "  Step 7: Data Migration from Atlas"
echo "========================================="

# Install MongoDB tools for mongodump/mongorestore
apt install -y mongodb-database-tools 2>/dev/null || {
    echo "Installing MongoDB Database Tools..."
    wget -q https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.10.0.deb
    dpkg -i mongodb-database-tools-ubuntu2204-x86_64-100.10.0.deb
    rm mongodb-database-tools-ubuntu2204-x86_64-100.10.0.deb
}

# Export from MongoDB Atlas
echo "Exporting data from MongoDB Atlas..."
mkdir -p /tmp/mongo_backup

mongodump \
  --uri="mongodb+srv://urbanspacebuilderstech_db_user:BwrIZOO1GfTYGIbW@constructioncrm.l86s93a.mongodb.net/construction_crm" \
  --out=/tmp/mongo_backup

echo "Export complete!"
echo ""

# Import to local MongoDB
echo "Importing data to local MongoDB..."
mongorestore \
  --db=construction_crm \
  /tmp/mongo_backup/construction_crm

echo "========================================="
echo "  Data migration complete!"
echo "  Your live data is now on this VPS"
echo "========================================="
echo ""
echo "Verify: mongosh construction_crm --eval 'db.stats()'"
echo ""
echo "Clean up backup: rm -rf /tmp/mongo_backup"
