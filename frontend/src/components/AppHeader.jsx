import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SUPER_ADMIN_NAV = [
  { label: 'My Dashboard', path: '/dashboard' },
  { label: 'All Projects', path: '/projects' },
  { label: 'Accounts', path: '/accounts-board' },
  { label: 'Planning', path: '/planning-board' },
  { label: 'Marketing Board', path: '/marketing-board' },
  { label: 'GM', path: '/gm-dashboard' },
  { label: 'Users', path: '/users' },
  { label: 'Settings', path: '/settings' },
];

// Sub-navigation menus per module
const SUB_MENUS = {
  '/projects': [
    { label: 'All Projects', path: '/projects' },
  ],
  '/accounts-board': [
    { label: 'Accounts Board', path: '/accounts-board' },
    { label: 'Approvals', path: '/approvals' },
    { label: 'Cashbook', path: '/accountant-module' },
    { label: 'Suspense Account', path: '/suspense-account' },
    { label: 'Cheque Management', path: '/cheque-management' },
    { label: 'Project Finance', path: '/accountant-dashboard' },
    { label: 'HR Portal', path: '/hr-portal' },
  ],
  '/planning-board': [
    { label: 'Planning Board', path: '/planning-board' },
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
    { label: 'Financial Overview', path: '/financial-overview' },
    { label: 'Procurement', path: '/procurement-board-v2' },
    { label: 'Work Orders', path: '/work-order-management' },
  ],
  '/users': [
    { label: 'User Management', path: '/users' },
  ],
  '/settings': [
    { label: 'Settings', path: '/settings' },
    { label: 'Materials', path: '/materials' },
    { label: 'Vendors', path: '/vendor-management' },
  ],
};

// Map any child path back to its parent module for sub-menu lookup
const PATH_TO_MODULE = {};
Object.entries(SUB_MENUS).forEach(([moduleKey, items]) => {
  items.forEach(item => { PATH_TO_MODULE[item.path] = moduleKey; });
});
// Also map project detail pages
['/projects/'].forEach(prefix => { PATH_TO_MODULE[prefix] = '/projects'; });

function getModuleKey(pathname) {
  // Exact match first
  if (PATH_TO_MODULE[pathname]) return PATH_TO_MODULE[pathname];
  // Prefix match for dynamic routes like /projects/:id
  if (pathname.startsWith('/projects/')) return '/projects';
  if (pathname.startsWith('/boq/')) return '/planning-board';
  if (pathname.startsWith('/site-engineer')) return null;
  return null;
}

export function AppHeader({ user, unreadNotifs = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`, {}, { withCredentials: true }); } catch {}
    navigate('/login', { replace: true });
  };

  const currentPath = location.pathname;
  const moduleKey = getModuleKey(currentPath);
  const subItems = moduleKey ? SUB_MENUS[moduleKey] : null;

  const isMainActive = (path) => {
    if (path === '/dashboard') return currentPath === '/dashboard';
    const mk = getModuleKey(currentPath);
    return mk === path;
  };

  const isSubActive = (path) => currentPath === path || currentPath.startsWith(path + '/');

  return (
    <div className="sticky top-0 z-50">
      {/* Main Header */}
      <header data-testid="app-header" className="bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => navigate('/dashboard')} data-testid="header-brand">
            <img src="/logo.webp" alt="My Home USB" className="h-9 w-9 object-contain" style={{ mixBlendMode: 'multiply' }} />
            <div className="leading-tight">
              <span className="font-bold text-base text-gray-900 block">My Home USB</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                {user?.role?.replace(/_/g, ' ') || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Center: Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-4" data-testid="header-nav">
            {SUPER_ADMIN_NAV.map((item) => (
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
            ))}
          </nav>

          {/* Right: Notifs + User + Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/notifications')} className="relative h-9 w-9" data-testid="header-notifications">
              <Bell className="h-4 w-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">{unreadNotifs}</span>
              )}
            </Button>
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-gray-900" data-testid="header-username">{user?.name}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{user?.role?.replace(/_/g, ' ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9 text-gray-400 hover:text-red-500" data-testid="header-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Sub-navigation bar */}
      {subItems && subItems.length > 1 && (
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
