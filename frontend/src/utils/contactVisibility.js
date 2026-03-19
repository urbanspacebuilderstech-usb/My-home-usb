/**
 * Contact visibility rules:
 * - Super Admin, Sales, Pre-Sales: ALWAYS see phone/email
 * - Everyone else: Only after project converted + payment approved by accountant
 */

const PRIVILEGED_ROLES = ['super_admin', 'sales', 'pre_sales'];

export function canViewContact(userRole) {
  return PRIVILEGED_ROLES.includes(userRole);
}
