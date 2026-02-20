# Database Architecture & Security Guide

## Current Setup

### Database Technology
- **Database**: MongoDB (NoSQL Document Database)
- **Connection**: `mongodb://localhost:27017`
- **Database Name**: `test_database`
- **Driver**: Motor (Async MongoDB driver for Python)

### Collections (Tables)
Your application uses **38 collections** to store different data:

| Collection | Records | Purpose |
|------------|---------|---------|
| `projects` | High | Core project data |
| `users` | Medium | User accounts & roles |
| `work_orders` | High | Work order management |
| `scope_items` | High | Project scope line items |
| `payment_stages` | Medium | Payment milestones |
| `material_expenses` | Medium | Material expense tracking |
| `labour_expenses` | Medium | Labour expense tracking |
| `vendor_master` | Low | Vendor directory |
| `packages` | Low | Project package templates |
| `income` | Medium | Income records |
| `notifications` | High | User notifications |
| `user_sessions` | Medium | Active login sessions |
| `audit_logs` | High | Activity tracking |
| ... and 25 more | | |

---

## Current Security Measures

### 1. Authentication
```
✅ Session-based authentication with secure tokens
✅ HTTP-only cookies (prevents XSS attacks)
✅ Session expiration (7 days)
✅ Logout clears session from database
```

### 2. Authorization (Role-Based Access Control)
```
✅ 8 distinct user roles with different permissions
✅ Role checked on every API endpoint
✅ Super Admin has full access
✅ Other roles restricted to their functions
```

### 3. Data Validation
```
✅ Pydantic models validate all input data
✅ Type checking on all fields
✅ Required fields enforced
```

### 4. Audit Logging
```
✅ All CRUD operations logged
✅ User ID, action, timestamp recorded
✅ Stored in audit_logs collection
```

---

## ⚠️ Current Limitations (Development Environment)

### What's NOT Currently Implemented:

| Security Feature | Status | Risk Level |
|-----------------|--------|------------|
| Database Authentication | ❌ No username/password | HIGH |
| Encryption at Rest | ❌ Data not encrypted | MEDIUM |
| Encryption in Transit | ❌ No TLS/SSL | HIGH |
| Database Backups | ❌ No automated backups | CRITICAL |
| Connection Pooling | ⚠️ Basic | LOW |
| Rate Limiting | ❌ No API rate limits | MEDIUM |
| IP Whitelisting | ❌ Open access | MEDIUM |

---

## Production-Ready Security Recommendations

### 1. Database Authentication
```bash
# MongoDB with authentication
MONGO_URL="mongodb://username:password@host:27017/dbname?authSource=admin"
```

### 2. Encryption in Transit (TLS/SSL)
```bash
# Enable TLS connection
MONGO_URL="mongodb://user:pass@host:27017/db?tls=true&tlsCAFile=/path/to/ca.pem"
```

### 3. Encryption at Rest
- Use MongoDB Enterprise with encrypted storage engine
- Or use cloud provider's encryption (AWS KMS, Azure Key Vault)

### 4. Backup Strategy
```bash
# Daily backup script
mongodump --uri="mongodb://..." --out=/backups/$(date +%Y%m%d)
mongorestore --uri="mongodb://..." /backups/20260220  # Restore
```

### 5. Connection Security
```python
# In server.py - Add connection pooling
client = AsyncIOMotorClient(
    MONGO_URL,
    maxPoolSize=50,
    minPoolSize=10,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=10000,
    socketTimeoutMS=20000
)
```

---

## Cloud Deployment Options (Recommended for Production)

### Option 1: MongoDB Atlas (Recommended)
**Managed MongoDB in the cloud**

| Feature | Included |
|---------|----------|
| Automatic Backups | ✅ Daily, point-in-time recovery |
| Encryption at Rest | ✅ AES-256 |
| Encryption in Transit | ✅ TLS 1.2+ |
| Authentication | ✅ SCRAM, X.509, LDAP |
| IP Whitelisting | ✅ Built-in |
| Monitoring | ✅ Real-time metrics |
| Auto-scaling | ✅ Scale storage/compute |
| Multi-region | ✅ Global clusters |

**Pricing**: Free tier available, then ~$57/month for M10 (production-ready)

### Option 2: AWS DocumentDB
- MongoDB-compatible
- Automatic backups (35 days retention)
- Encryption, VPC isolation
- Pricing: ~$200/month minimum

### Option 3: Self-Hosted (Advanced)
- Full control
- Requires DevOps expertise
- Manual backup setup required

---

## Database Schema Overview

### Core Data Model
```
┌─────────────────┐     ┌─────────────────┐
│     USERS       │     │    PROJECTS     │
├─────────────────┤     ├─────────────────┤
│ user_id (PK)    │────▶│ project_id (PK) │
│ email           │     │ name            │
│ name            │     │ client_name     │
│ role            │     │ total_value     │
│ created_at      │     │ status          │
└─────────────────┘     └────────┬────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  SCOPE_ITEMS    │     │ PAYMENT_STAGES  │     │   WORK_ORDERS   │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ scope_id (PK)   │     │ stage_id (PK)   │     │ work_order_id   │
│ project_id (FK) │     │ project_id (FK) │     │ project_id (FK) │
│ item_name       │     │ stage_name      │     │ status          │
│ quantity        │     │ amount          │     │ created_by      │
│ unit_rate       │     │ amount_received │     │ approved_by     │
│ total_amount    │     │ due_date        │     │ total_amount    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Backup & Recovery Plan

### Recommended Backup Schedule
| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Full Backup | Daily | 30 days |
| Incremental | Every 6 hours | 7 days |
| Point-in-time | Continuous | 24 hours |

### Recovery Time Objectives
- **RPO** (Recovery Point Objective): < 1 hour
- **RTO** (Recovery Time Objective): < 4 hours

### Backup Script (Local)
```bash
#!/bin/bash
# backup_mongodb.sh
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
MONGO_URI="mongodb://localhost:27017"

# Create backup
mongodump --uri="$MONGO_URI" --db=test_database --out="$BACKUP_DIR/$DATE"

# Compress
tar -czf "$BACKUP_DIR/$DATE.tar.gz" "$BACKUP_DIR/$DATE"
rm -rf "$BACKUP_DIR/$DATE"

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/$DATE.tar.gz"
```

---

## Access Control Matrix

| Role | Projects | Users | Finance | Settings | Delete |
|------|----------|-------|---------|----------|--------|
| Super Admin | Full | Full | Full | Full | Full |
| GM | Read/Write | Read | Read | Read | No |
| Planning | Read/Write | No | No | No | Limited |
| Accountant | Read | No | Full | No | No |
| Site Engineer | Read | No | No | No | No |
| Procurement | Read | No | No | No | No |
| Client | Read Own | No | No | No | No |

---

## Quick Security Checklist for Production

- [ ] Enable MongoDB authentication
- [ ] Use TLS/SSL for all connections
- [ ] Set up automated daily backups
- [ ] Configure IP whitelisting
- [ ] Enable audit logging
- [ ] Implement rate limiting on APIs
- [ ] Use environment variables for all secrets
- [ ] Set up monitoring and alerts
- [ ] Regular security updates
- [ ] Penetration testing

---

## Next Steps

1. **Immediate**: Sign up for MongoDB Atlas free tier
2. **Short-term**: Migrate data to Atlas
3. **Medium-term**: Implement full backup strategy
4. **Long-term**: Add encryption, monitoring, and compliance features

For questions about deployment, use the "Deploy" button in Emergent or contact support.
