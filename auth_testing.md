# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session

```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  role: 'super_admin',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API

```bash
# Test auth endpoint
curl -X GET "https://stage-popup.preview.emergentagent.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test projects endpoint
curl -X GET "https://stage-popup.preview.emergentagent.com/api/projects" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing

```javascript
// Set cookie and navigate
await page.context().addCookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "constru-hub-2.preview.emergentagent.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
}]);
await page.goto("https://stage-popup.preview.emergentagent.com/dashboard");
```

## Quick Debug

```bash
# Check data format
mongosh --eval "
use('test_database');
db.users.find().limit(2).pretty();
db.user_sessions.find().limit(2).pretty();
"

# Clean test data
mongosh --eval "
use('test_database');
db.users.deleteMany({email: /test\\.user\\./});
db.user_sessions.deleteMany({session_token: /test_session/});
"
```

## Checklist

- [ ] User document has user_id field
- [ ] Session user_id matches user's user_id
- [ ] All queries use `{"_id": 0}` projection
- [ ] API returns user data with user_id field
- [ ] Browser loads dashboard

## Success Indicators

✅ /api/auth/me returns user data
✅ Dashboard loads without redirect
✅ CRUD operations work

## Failure Indicators

❌ "User not found" errors
❌ 401 Unauthorized responses
❌ Redirect to login page