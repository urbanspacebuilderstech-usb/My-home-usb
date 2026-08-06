import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Bell,
  User,
  Camera,
  ShoppingCart,
  CheckSquare,
  IndianRupee,
  Shield,
  Home,
  CreditCard,
  Menu,
  HardHat,
  Calculator,
  Target,
  Landmark,
  TrendingUp,
  Settings,
  Users,
  X,
  LogOut,
  FileText,
  ClipboardList,
  Wallet,
  Clock,
  Receipt,
  PlusCircle,
  MinusCircle,
  FileCheck,
  ListChecks,
  Image
} from 'lucide-react';
import { useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Super Admin: matches header menus exactly
// Bottom bar: Dashboard, Projects, Accounts, Planning, More
// More drawer: Marketing Board, GM, Users, Settings, Notifications
const SA_BOTTOM = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Projects', icon: FolderKanban, path: '/projects' },
  { label: 'Accounts', icon: Landmark, path: '/accounts-board' },
  { label: 'Planning', icon: Calculator, path: '/planning-board' },
  { label: 'More', icon: Menu, action: 'more' },
];

const SA_MORE_ITEMS = [
  { label: 'Marketing Board', icon: TrendingUp, path: '/marketing-board' },
  { label: 'GM Dashboard', icon: Shield, path: '/gm-dashboard' },
  { label: 'Users', icon: Users, path: '/users' },
  { label: 'Settings', icon: Settings, path: '/settings' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
];

const OTHER_ROLES = {
  accountant: [
    { label: 'Dashboard', icon: Landmark, path: '/accounts-board' },
    { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { label: 'HR', icon: IndianRupee, path: '/hr-portal' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  general_manager: [
    { label: 'Command', icon: Shield, path: '/gm-dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ],
  project_manager: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ],
  planning: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Planning', icon: Calculator, path: '/planning-board' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ],
  site_engineer: [
    { label: 'Projects', icon: HardHat, path: '/site-engineer' },
    { label: 'Receipt', icon: Camera, path: '/site-engineer/material-receipt' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/settings' },
  ],
  // Aug 5 2026 — Sr. Site Engineer had no entry here, so it silently fell
  // back to SA_BOTTOM (Dashboard/Projects/Accounts/Planning/More) — a
  // Super Admin nav that makes no sense for this role. Mirror the 5 tabs
  // on the dashboard's own tab bar via `?tab=` so tapping one here lands
  // directly on that tab instead of always reopening on Projects.
  sr_site_engineer: [
    { label: 'Projects', icon: HardHat, path: '/site-engineer' },
    { label: 'DLR&DPR', icon: FileText, path: '/site-engineer?tab=dlrdpr' },
    { label: 'Requests', icon: ClipboardList, path: '/site-engineer?tab=requests' },
    { label: 'Petty Cash', icon: Wallet, path: '/site-engineer?tab=pettycash' },
    { label: 'Attendance', icon: Clock, path: '/site-engineer?tab=attendance' },
  ],
  procurement: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Procurement', icon: ShoppingCart, path: '/procurement-board-v2' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ],
  cre: [
    { label: 'CRE Board', icon: Target, path: '/cre-board' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ],
  // Aug 6 2026 — Overview/Payments used to both point at the exact same
  // path with no way to tell them apart, and none of the portal's other
  // 6 tabs (Deductions/Final Estimate/Income/Scope/Photos/Documents) were
  // reachable from mobile at all except by scrolling the desktop tab
  // strip sideways. Mirrors the Sr Site Engineer pattern: primary tabs on
  // the bar via `?tab=`, the rest in More.
  client: [
    { label: 'Overview', icon: Home, path: '/client-portal' },
    { label: 'Income', icon: Receipt, path: '/client-portal?tab=income' },
    { label: 'Payments', icon: CreditCard, path: '/client-portal?tab=payments' },
    { label: 'Additional', icon: PlusCircle, path: '/client-portal?tab=additional' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  pre_sales: [
    { label: 'Leads', icon: Target, path: '/crm-pre-sales' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/settings' },
  ],
  sales: [
    { label: 'Sales', icon: TrendingUp, path: '/crm-sales' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/settings' },
  ],
};

const ACCOUNTANT_MORE = [
  { label: 'Cheque Mgmt', icon: CreditCard, path: '/cheque-management' },
  { label: 'Project Finance', icon: TrendingUp, path: '/accountant-dashboard' },
  { label: 'HR Portal', icon: Users, path: '/hr-portal' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
];

const CLIENT_MORE = [
  { label: 'Deductions', icon: MinusCircle, path: '/client-portal?tab=deductions' },
  { label: 'Final Estimate', icon: FileCheck, path: '/client-portal?tab=final_estimate' },
  { label: 'Scope of Work', icon: ListChecks, path: '/client-portal?tab=scope' },
  { label: 'Photos', icon: Image, path: '/client-portal?tab=photos' },
  { label: 'Documents', icon: FileText, path: '/client-portal?tab=documents' },
];

export default function MobileBottomNav({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  
  if (!user) return null;

  const isSuperAdmin = user.role === 'super_admin';
  const isAccountant = user.role === 'accountant';
  const isClient = user.role === 'client';
  const hasMore = isSuperAdmin || isAccountant || isClient;
  const navItems = isSuperAdmin ? SA_BOTTOM : (OTHER_ROLES[user.role] || SA_BOTTOM);
  const moreItems = isSuperAdmin ? SA_MORE_ITEMS : isAccountant ? ACCOUNTANT_MORE : isClient ? CLIENT_MORE : [];
  
  const isActive = (path) => {
    // Aug 5 2026 — Sr. Site Engineer's tabs all share the SAME base path
    // ('/site-engineer') and differ only by `?tab=` query string, so a
    // plain pathname comparison would either highlight every one of them
    // at once or none of them. Compare the query too when the nav item
    // itself carries one; for query-less items, only treat as active
    // when the current URL ALSO has no differentiating `tab=` query.
    if (path.includes('?')) {
      const [itemPath, itemQuery] = path.split('?');
      // Client can be viewing a specific project at /client-portal/:projectId
      // rather than the bare /client-portal — match on the base path so the
      // active tab still highlights correctly for that project's URL.
      const pathMatches = itemPath === '/client-portal'
        ? location.pathname.startsWith('/client-portal')
        : location.pathname === itemPath;
      return pathMatches && location.search === `?${itemQuery}`;
    }
    if (path === '/dashboard' && location.pathname === '/dashboard') return true;
    if (path !== '/dashboard' && location.pathname.startsWith(path)) {
      if (location.search && location.search.includes('tab=')) return false;
      return true;
    }
    return false;
  };

  const handleNav = (item) => {
    if (item.action === 'more') {
      setMoreOpen(!moreOpen);
      return;
    }
    setMoreOpen(false);
    let target = item.path;
    // Client bottom-nav items are hardcoded to the bare /client-portal base
    // path, but a client with multiple projects views a specific one at
    // /client-portal/:projectId. Preserve that project segment instead of
    // bouncing back to the picker/default project on every tab tap.
    if (target.startsWith('/client-portal') && location.pathname.startsWith('/client-portal/')) {
      const projectSegment = location.pathname.slice('/client-portal'.length); // '/proj_xyz'
      const [, query] = target.split('?');
      target = `/client-portal${projectSegment}${query ? `?${query}` : ''}`;
    }
    navigate(target);
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`, {}, { withCredentials: true }); } catch {}
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* More drawer overlay */}
      {moreOpen && hasMore && (
        <div className="md:hidden fixed inset-0 z-[60]" data-testid="mobile-more-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-2xl border-t"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-bold text-gray-800">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="close-more-drawer">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="px-2 pb-3 space-y-0.5">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    data-testid={`mobile-more-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                    onClick={() => handleNav(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-4.5 w-4.5 ${active ? 'text-amber-600' : 'text-gray-400'}`} />
                    {item.label}
                  </button>
                );
              })}
              <div className="border-t mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  data-testid="mobile-more-logout"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4.5 w-4.5" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom spacer */}
      <div className="lg:hidden h-16" />
      
      {/* Fixed Bottom Nav */}
      <nav 
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50"
        data-testid="mobile-bottom-nav"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const active = item.path ? isActive(item.path) : moreOpen;
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => handleNav(item)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
                  active ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-500 rounded-b" />}
                <Icon className="h-5 w-5" />
                <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
