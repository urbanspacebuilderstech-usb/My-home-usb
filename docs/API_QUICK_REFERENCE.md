# ConstructionOS API Quick Reference

## Base URL
```
https://your-domain.com/api
```

## Authentication
```http
POST /api/auth/demo-login
Content-Type: application/json
{"email": "admin@constructionos.com"}
```

## Most Used Endpoints

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List all projects |
| POST | /api/projects | Create project |
| GET | /api/projects/{id} | Get project |
| PATCH | /api/projects/{id} | Update project |
| GET | /api/projects/{id}/payment-summary | Payment summary |

### Leads (CRM)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/crm/pre-sales/leads | Pre-sales leads |
| POST | /api/crm/leads | Create lead |
| PATCH | /api/crm/leads/{id}/stage | Move lead stage |
| POST | /api/crm/leads/{id}/follow-ups | Add follow-up |

### Financial
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/income | All income |
| POST | /api/income | Record income |
| GET | /api/expenses | All expenses |
| POST | /api/accountant/record-expense | Record expense |
| GET | /api/accountant/petty-cash | Petty cash |

### Site Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/site-engineer/my-projects | Engineer's projects |
| POST | /api/site-engineer/material-requests | Request material |
| POST | /api/site-engineer/petty-cash/request | Request cash |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List users |
| POST | /api/users | Create user |
| PATCH | /api/users/{id}/role | Change role |

### Security
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/security/status | Security status |
| GET | /api/security/audit-logs | Audit logs |

## Response Format
```json
// Success
{"data": {...}, "message": "Success"}

// Error
{"detail": "Error message"}
```

## Status Codes
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Rate Limited
- 500: Server Error

## Rate Limits
- General: 100 req/min
- Login: 5 attempts/min

## Roles (Hierarchy)
1. client (1)
2. site_engineer (2)
3. pre_sales, sales (3)
4. cre, planning, procurement (4)
5. accountant (5)
6. project_manager, marketing_head (6)
7. gm (7)
8. super_admin (10)
