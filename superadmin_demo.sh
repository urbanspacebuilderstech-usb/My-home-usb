#!/bin/bash

# ConstructionOS Super Admin Demo Script
# This demonstrates all super admin capabilities

API_URL="https://sitehub-38.preview.emergentagent.com/api"
TOKEN="superadmin_demo_1768204210044"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏗️  ConstructionOS - Super Admin Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Authentication
echo "🔐 AUTHENTICATION"
echo "─────────────────────────────────────────"
echo "Your Token: $TOKEN"
echo ""
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/auth/me" | jq '{name, email, role, phone}'
echo ""
echo ""

# Dashboard Metrics
echo "📊 SUPER ADMIN DASHBOARD"
echo "─────────────────────────────────────────"
DASHBOARD=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/dashboards/super-admin")
echo "$DASHBOARD" | jq -r '"Total Projects: " + (.total_projects | tostring)'
echo "$DASHBOARD" | jq -r '"Total Value: ₹" + ((.total_project_value / 100000 | tonumber * 100 | round / 100) | tostring) + "L"'
echo "$DASHBOARD" | jq -r '"Received: ₹" + ((.total_received / 100000 | tonumber * 100 | round / 100) | tostring) + "L"'
echo "$DASHBOARD" | jq -r '"Balance: ₹" + ((.balance / 100000 | tonumber * 100 | round / 100) | tostring) + "L"'
echo ""
echo ""

# Projects
echo "🏢 PROJECTS"
echo "─────────────────────────────────────────"
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/projects" | \
  jq -r '.[] | "• " + .name + " (" + .client_name + ")\n  Location: " + .location + "\n  Value: ₹" + ((.total_value / 100000) | tostring) + "L\n  Status: " + .status + "\n"'
echo ""

# Users
echo "👥 SYSTEM USERS"
echo "─────────────────────────────────────────"
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/users" | \
  jq -r '.[] | "• " + .name + " (" + .role + ")\n  Email: " + .email + "\n"'
echo ""

# Work Orders
echo "📋 WORK ORDERS"
echo "─────────────────────────────────────────"
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/work-orders" | \
  jq -r '.[] | "• " + .work_order_id + " - Status: " + .status + "\n  " + .purpose[0:60] + "...\n  Amount: ₹" + (.estimated_cost | tostring) + "\n"'
echo ""

# Vendors
echo "🏪 VENDORS"
echo "─────────────────────────────────────────"
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/vendors" | \
  jq -r '.[] | "• " + .name + "\n  Contact: " + .contact_person + " - " + .phone + "\n"'
echo ""

# BOQ Summary
echo "💰 BOQ SUMMARY (Classic Condo)"
echo "─────────────────────────────────────────"
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/boq/proj_classic001" | \
  jq -r '.[] | "• " + .item_name + " (" + .category + ")\n  " + (.quantity | tostring) + " " + .unit + " × ₹" + (.unit_rate | tostring) + " = ₹" + (.total_cost | tostring) + "\n"'

TOTAL_BOQ=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/boq/proj_classic001" | jq '[.[].total_cost] | add')
echo "  ───────────────────────"
echo "  Total BOQ Budget: ₹$TOTAL_BOQ"
echo ""
echo ""

# Available Actions
echo "⚡ SUPER ADMIN CAPABILITIES"
echo "─────────────────────────────────────────"
echo "✅ Create and manage projects"
echo "✅ Create and assign user roles"
echo "✅ View all work orders (any status)"
echo "✅ Access all financial data"
echo "✅ View all expenses and payments"
echo "✅ Manage vendors and suppliers"
echo "✅ Access client portal data"
echo "✅ View audit logs"
echo "✅ Override any permission restrictions"
echo ""
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 HOW TO USE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. WEB ACCESS:"
echo "   URL: https://sitehub-38.preview.emergentagent.com"
echo "   Login: admin@constructionos.com (via Google OAuth)"
echo ""
echo "2. API ACCESS:"
echo "   curl -H \"Authorization: Bearer $TOKEN\" \\"
echo "        $API_URL/<endpoint>"
echo ""
echo "3. EXAMPLE COMMANDS:"
echo ""
echo "   # Create a new project:"
echo "   curl -X POST $API_URL/projects \\"
echo "     -H \"Authorization: Bearer $TOKEN\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"name\":\"New Project\",\"client_name\":\"Client\",..."
echo ""
echo "   # Create a new user:"
echo "   curl -X POST $API_URL/users \\"
echo "     -H \"Authorization: Bearer $TOKEN\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"email\":\"new@example.com\",\"name\":\"Name\",\"role\":\"accountant\"...}'"
echo ""
echo "   # View project dashboard:"
echo "   curl -H \"Authorization: Bearer $TOKEN\" \\"
echo "        $API_URL/dashboards/project/proj_classic001"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
