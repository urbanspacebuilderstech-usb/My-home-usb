import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LogOut, UserCircle, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { useTheme } from '../hooks/useTheme';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ═══ ROLE-BASED NAVIGATION ═══

const ROLE_NAV = {
  super_admin: [
    { label: 'Finance Board', path: '/finance-board' },
    { label: 'Planning', path: '/planning-board' },
    { label: 'Marketing Board', path: '/marketing-board' },
    { label: 'HR', path: '/hr-portal' },
    { label: 'Users', path: '/users' },
    { label: 'User App', path: '/user-app' },
    { label: 'Settings', path: '/settings' },
  ],
  accountant: [
    { label: 'Cashbook', path: '/accounts-board?tab=cashbook' },
    { label: 'Approvals', path: '/accounts-board?tab=approvals' },
    { label: 'Sales CRM', path: '/crm-sales' },
    { label: 'Expense', path: '/accounts-board?tab=cashbook&sub=expense' },
    { label: 'Cheque Management', path: '/accounts-board?tab=cheques' },
    { label: 'Suspense A/c', path: '/suspense-account' },
    { label: 'Other Accounts', path: '/other-accounts' },
    { label: 'Project Wise', path: '/accounts-board?tab=projects' },
  ],
  general_manager: [
    { label: 'Command Center', path: '/gm-dashboard' },
    { label: 'Projects', path: '/projects' },
    { label: 'Planning Board', path: '/planning-board' },
    { label: 'Financial', path: '/financial-overview' },
    { label: 'Approvals', path: '/approvals' },
    { label: 'Procurement', path: '/procurement-board-v2' },
  ],
  project_manager: [
    { label: 'Dashboard', path: '/pm-dashboard' },
    { label: 'Projects', path: '/projects' },
    { label: 'Work Orders', path: '/work-order-management' },
    { label: 'Procurement', path: '/procurement-board-v2' },
  ],
  planning: [
    { label: 'Planning Board', path: '/planning-board' },
    { label: 'Projects', path: '/projects' },
    { label: 'Vendors', path: '/vendor-management' },
    { label: 'Contractors', path: '/contractor-management' },
    { label: 'BOQ', path: '/planning-board?tab=boq' },
  ],
  planning_person: [
    { label: 'Planning Board', path: '/planning-board' },
  ],
  procurement: [
    { label: 'Procurement', path: '/procurement-board-v2' },
    { label: 'Projects', path: '/projects' },
    { label: 'Packages', path: '/packages' },
    { label: 'Vendors', path: '/vendor-management' },
  ],
  cre: [],  // CRE has all sub-tabs inside the CRE Board page; no top nav
  pre_sales: [
    { label: 'Pre-Sales CRM', path: '/crm-pre-sales' },
    { label: 'User App', path: '/user-app' },
  ],
  sales: [
    { label: 'Sales CRM', path: '/crm-sales' },
    { label: 'User App', path: '/user-app' },
  ],
  site_engineer: [
    { label: 'Dashboard', path: '/site-engineer' },
  ],
  architect: [
    { label: 'My Projects', path: '/architect-dashboard' },
  ],
  hr: [
    { label: 'HR Portal', path: '/hr-portal' },
    { label: 'Projects', path: '/projects' },
  ],
  quality_check: [
    { label: 'QC Dashboard', path: '/qc-dashboard' },
  ],
  prospect: [],  // mobile app uses its own footer nav; AppHeader is hidden
};

// ═══ SUB-MENUS (used by super_admin and accountant) ═══

const ROLE_SUB_MENUS = {
  super_admin: {
    '/projects': [{ label: 'All Projects', path: '/projects' }],
    '/financial-overview': [
      { label: 'Financial Overview', path: '/financial-overview' },
      { label: 'Approvals', path: '/approvals' },
      { label: 'Expenses', path: '/expenses' },
      { label: 'Indirect Costs', path: '/indirect-costs' },
    ],
    '/hr-portal': [
      { label: 'HR Portal', path: '/hr-portal' },
    ],
    '/planning-board': [
      { label: 'Planning Board', path: '/planning-board' },
      { label: 'BOQ', path: '/planning-board?tab=boq' },
      { label: 'Vendors', path: '/vendor-management' },
      { label: 'Contractors', path: '/contractor-management' },
    ],
    '/marketing-board': [
      { label: 'Marketing Board', path: '/marketing-board' },
      { label: 'CRE Board', path: '/cre-board' },
      { label: 'Pre-Sales CRM', path: '/crm-pre-sales' },
      { label: 'Sales CRM', path: '/crm-sales' },
      { label: 'RE Projects', path: '/crm/re-projects' },
      { label: 'Custom Fields', path: '/crm/custom-fields' },
      { label: 'CSV Import', path: '/crm/import-csv' },
    ],
    '/gm-dashboard': [
      { label: 'GM Command Center', path: '/gm-dashboard' },
      { label: 'PM Dashboard', path: '/pm-dashboard' },
      { label: 'QC Dashboard', path: '/qc-dashboard' },
      { label: 'Procurement', path: '/procurement-board-v2' },
      { label: 'Work Orders', path: '/work-order-management' },
    ],
    '/users': [{ label: 'User Management', path: '/users' }],
    '/settings': [
      { label: 'Settings', path: '/settings' },
      { label: 'Materials', path: '/materials' },
      { label: 'Vendors', path: '/vendor-management' },
    ],
  },
  // Accountant has no sub-menus (all items are in the main nav)
};

// Build path-to-module maps per role
function buildPathMap(subMenus) {
  const map = {};
  if (!subMenus) return map;
  Object.entries(subMenus).forEach(([moduleKey, items]) => {
    items.forEach(item => { map[item.path] = moduleKey; });
  });
  return map;
}

function getModuleKey(pathname, role) {
  const subMenus = ROLE_SUB_MENUS[role];
  if (!subMenus) return null;
  const pathMap = buildPathMap(subMenus);
  if (pathMap[pathname]) return pathMap[pathname];
  if (pathname.startsWith('/projects/')) return '/projects';
  if (pathname.startsWith('/boq/')) return '/planning-board';
  return null;
}

// Friendly display label for the role badge (top-left + profile dropdown).
// Falls back to `role.replace('_', ' ')` for any role not mapped here.
const ROLE_LABEL_MAP = {
  planning: 'Planning Head',
  planning_person: 'Planning Person',
};
const roleLabel = (r) => (r ? (ROLE_LABEL_MAP[r] || r.replace(/_/g, ' ')) : '…');

export function AppHeader({ user, unreadNotifs = 0, customNav, activeCustomNav, onCustomNavChange, headerActions, hideNav = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  // Embedded mode: hosted inside Finance Board (or another) iframe.
  // - `?embedded=1` alone → render nothing (parent already has its own header).
  // - `?embedded=1&navRole=<role>` → render a slim sub-nav strip using that role's
  //   ROLE_NAV (e.g. show Cashbook/Approvals/Expense for super_admin viewing
  //   /accounts-board through the Finance Board's Accounts tab).
  // - Defense-in-depth: if we are inside an iframe (window.parent !== window)
  //   but the embedded=1 flag was somehow lost (e.g. internal navigate() without
  //   query-string preservation), still suppress the full header — render nothing.
  //   This eliminates the "double header" bug seen on the Super Admin Finance Board.
  if (typeof window !== 'undefined') {
    const qs = new URLSearchParams(window.location.search);
    let inIframe = false;
    try { inIframe = window.self !== window.top; } catch { inIframe = true; }
    if (qs.get('embedded') === '1' || inIframe) {
      const navRole = qs.get('navRole');
      const embeddedNav = navRole ? (ROLE_NAV[navRole] || []) : [];
      if (embeddedNav.length === 0) return null;
      const currentFull = location.pathname + (location.search || '');
      const isEmbedActive = (path) => {
        // Strip the embedded= and navRole= params before comparing
        const target = path.includes('?')
          ? `${path}${path.includes('&') ? '&' : '&'}embedded=1&navRole=${navRole}`
          : `${path}?embedded=1&navRole=${navRole}`;
        // Loose match — strip query and compare base path + tab param if present
        const [tp, tq] = target.split('?');
        const [cp, cq] = currentFull.split('?');
        if (tp !== cp) return false;
        const tparams = new URLSearchParams(tq || '');
        const cparams = new URLSearchParams(cq || '');
        return tparams.get('tab') === cparams.get('tab');
      };
      return (
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 sticky top-0 z-40 dark:bg-gray-900 dark:border-gray-800" data-testid="embedded-sub-nav">
          <nav className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-hide">
            {embeddedNav.map((item) => {
              // Preserve embedded flags when navigating between sub-nav items
              const sep = item.path.includes('?') ? '&' : '?';
              const target = `${item.path}${sep}embedded=1&navRole=${navRole}`;
              return (
                <button
                  key={item.path}
                  data-testid={`embed-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                  onClick={() => navigate(target)}
                  className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    isEmbedActive(item.path)
                      ? 'bg-amber-50 text-amber-700 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      );
    }
  }

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`, {}, { withCredentials: true }); } catch {}
    // Clear auth cache
    if (window.__clearAuthCache) window.__clearAuthCache();
    navigate('/login', { replace: true });
  };

  // While the user object is loading on a page, fall back to the cached
  // user from sessionStorage so the nav renders instantly. Avoids the
  // "empty header on /hr-portal until /auth/me resolves" flash.
  let effectiveUser = user;
  if (!effectiveUser && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('mhu_user_cache');
      if (raw) effectiveUser = JSON.parse(raw);
    } catch { /* ignore */ }
  }
  const role = effectiveUser?.role;
  const navItems = role ? (ROLE_NAV[role] || []) : [];
  const currentPath = location.pathname;
  const currentSearch = location.search || '';
  const moduleKey = getModuleKey(currentPath, role);
  const subMenus = ROLE_SUB_MENUS[role];
  const subItems = moduleKey && subMenus ? subMenus[moduleKey] : null;
  const hasCustomNav = customNav && customNav.length > 0;

  const isMainActive = (path) => {
    if (subMenus) {
      const mk = getModuleKey(currentPath, role);
      return mk === path;
    }
    // If path contains query string (e.g. ?tab=cashbook), match full path+search
    if (path.includes('?')) {
      return (currentPath + currentSearch) === path;
    }
    // If current URL has a query string but nav item doesn't, this nav is NOT active
    // (prevents e.g. /accounts-board from matching when user is on /accounts-board?tab=approvals)
    if (currentSearch && path === currentPath) return false;
    if (path === currentPath) return true;
    if (path !== '/' && currentPath.startsWith(path)) return true;
    return false;
  };

  const isSubActive = (path) => currentPath === path || currentPath.startsWith(path + '/');

  // For super_admin, never let a page's customNav replace the main top nav.
  // Instead, render the customNav as a sub-strip below — this way Super Admin's
  // shell (Finance Board · Planning · Marketing · HR · Users · …) is always
  // visible no matter which inner page they're on.
  const customNavAsSub = role === 'super_admin' && hasCustomNav;
  const showMainNav = !hasCustomNav || customNavAsSub;

  return (
    <div className="sticky top-0 z-50 bg-white dark:bg-gray-900">
      {/* Main Header */}
      <header data-testid="app-header" className="bg-white border-b border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => navigate(navItems[0]?.path || '/dashboard')} data-testid="header-brand">
            <img src="/logo.webp" alt="My Home USB" className="h-9 w-9 object-contain" style={{ mixBlendMode: 'multiply' }} />
            <div className="leading-tight">
              <span className="font-bold text-base text-gray-900 block">My Home USB</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                {roleLabel(role)}
              </span>
            </div>
          </div>

          {/* Center: Desktop Nav (hidden when caller passes hideNav) */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-4 overflow-x-auto" data-testid="header-nav">
            {hideNav ? null : hasCustomNav && !customNavAsSub ? (
              customNav.map((item) => (
                <button
                  key={item.value}
                  data-testid={`nav-${item.value.replace(/_/g, '-')}`}
                  onClick={() => onCustomNavChange?.(item.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCustomNav === item.value
                      ? 'bg-amber-50 text-amber-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </button>
              ))
            ) : showMainNav && navItems.length > 1 ? (
              navItems.map((item) => (
                <button
                  key={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                  onClick={() => navigate(item.path)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    isMainActive(item.path)
                      ? 'bg-amber-50 text-amber-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </button>
              ))
            ) : null}
          </nav>

          {/* Right: Theme + Notifs + Profile + User + Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 text-gray-500 hover:text-amber-500 dark:text-gray-300"
              data-testid="header-theme-toggle"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/notifications')} className="relative h-9 w-9" data-testid="header-notifications">
              <Bell className="h-4 w-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">{unreadNotifs}</span>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} className="h-9 w-9 text-gray-500 hover:text-amber-600" data-testid="header-profile">
              <UserCircle className="h-5 w-5" />
            </Button>
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-gray-900" data-testid="header-username">{effectiveUser?.name || ''}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{roleLabel(role)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9 text-gray-400 hover:text-red-500" data-testid="header-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Sub-navigation bar — for super_admin we surface the page's customNav
          here so the Super Admin shell stays visible at the top. */}
      {!hideNav && customNavAsSub && customNav && customNav.length > 0 && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 lg:px-6" data-testid="sub-nav">
          <div className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-hide">
            {customNav.map((item) => (
              <button
                key={item.value}
                data-testid={`subnav-${item.value.replace(/_/g, '-')}`}
                onClick={() => onCustomNavChange?.(item.value)}
                className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCustomNav === item.value
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sub-navigation bar (only for roles with sub-menus, hidden when custom nav is active) */}
      {!hideNav && !hasCustomNav && subItems && subItems.length > 1 && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 lg:px-6" data-testid="sub-nav">
          <div className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-hide">
            {subItems.map((item) => (
              <button
                key={item.path}
                data-testid={`subnav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => navigate(item.path)}
                className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  isSubActive(item.path)
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
