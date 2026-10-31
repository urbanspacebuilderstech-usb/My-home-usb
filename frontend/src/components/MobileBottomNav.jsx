import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Bell,
  User,
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
  Image,
  Store,
  Package,
  Radio,
  Building2,
  ClipboardCheck,
  Lightbulb
} from 'lucide-react';
import { useState } from 'react';
import axios from 'axios';
import { ROLE_NAV } from './AppHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Super Admin — Sep 30 2026: follows the desktop header (Dashboard, Finance
// Board, Planning, Sales, Marketing Board, HR, Settings). "Dashboard" used to
// open /dashboard, which just redirects to the Finance Board, so the Super
// Admin Dashboard wasn't reachable on a phone. Nothing was dropped: Projects
// moved into More with the rest. Later the same day the Super Admin asked
// for Accounts on the bar (Dashboard, Finance, Accounts, Planning) and Sales
// at the top of More.
const SA_BOTTOM = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/super-admin-dashboard' },
  { label: 'Finance', icon: IndianRupee, path: '/finance-board' },
  { label: 'Accounts', icon: Landmark, path: '/accounts-board' },
  { label: 'Planning', icon: Calculator, path: '/planning-board' },
  { label: 'More', icon: Menu, action: 'more' },
];

const SA_MORE_ITEMS = [
  { label: 'Sales', icon: TrendingUp, path: '/sales-board' },
  { label: 'Marketing Board', icon: TrendingUp, path: '/marketing-board' },
  { label: 'HR', icon: Users, path: '/hr-portal' },
  { label: 'Settings', icon: Settings, path: '/settings' },
  { label: 'Projects', icon: FolderKanban, path: '/projects' },
  { label: 'GM Dashboard', icon: Shield, path: '/gm-dashboard' },
  { label: 'Users', icon: Users, path: '/users' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
];

const OTHER_ROLES = {
  // Oct 31 2026 — was Dashboard/Approvals/HR/More (Approvals opened the
  // standalone /approvals page). The bar now holds the first four Accounts
  // Board header tabs (Cashbook = no `?tab=`); the other four are in More.
  accountant: [
    { label: 'Cashbook', icon: Landmark, path: '/accounts-board' },
    { label: 'Approvals', icon: CheckSquare, path: '/accounts-board?tab=approvals' },
    { label: 'Expense', icon: Receipt, path: '/accounts-board?tab=cashbook&sub=expense' },
    { label: 'Cheque Mgmt', icon: CreditCard, path: '/accounts-board?tab=cheques' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  // Oct 31 2026 — was Command/Projects/Alerts/Profile. The bar now holds the
  // GM dashboard's four tabs (Rough Estimate = no `?tab=`); Notifications,
  // Profile and the header pages are in More.
  general_manager: [
    { label: 'Final Estimate', icon: FileText, path: '/gm-dashboard?tab=final_estimate' },
    { label: 'Rough Estimate', icon: Calculator, path: '/gm-dashboard' },
    { label: 'Planning', icon: Building2, path: '/gm-dashboard?tab=planning_board' },
    { label: 'Labour Advance', icon: Wallet, path: '/gm-dashboard?tab=labour_advance' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  // Oct 31 2026 — was Dashboard/Projects/Alerts/Profile. The bar now holds
  // the PM dashboard's three tabs (All Projects = no `?tab=`); Notifications
  // and Profile are in More.
  project_manager: [
    { label: 'All Projects', icon: FolderKanban, path: '/pm-dashboard' },
    { label: 'Requests', icon: ClipboardList, path: '/pm-dashboard?tab=requests' },
    { label: 'DLR & DPR', icon: FileText, path: '/pm-dashboard?tab=dlrdpr' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  planning: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Planning', icon: Calculator, path: '/planning-board' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  // Aug 11 2026 — was Projects/Receipt/Alerts/Profile, which didn't match
  // the dashboard's own tab bar at all. Mirrors the Sr. Site Engineer
  // pattern (same underlying page, just without the Sr-only Requests tab)
  // so tapping one of these lands directly on that tab via `?tab=`.
  site_engineer: [
    { label: 'Projects', icon: HardHat, path: '/site-engineer' },
    { label: 'DLR&DPR', icon: FileText, path: '/site-engineer?tab=dlrdpr' },
    { label: 'Petty Cash', icon: Wallet, path: '/site-engineer?tab=pettycash' },
    { label: 'Attendance', icon: Clock, path: '/site-engineer?tab=attendance' },
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
  // Oct 30 2026 — was Dashboard/Procurement/Alerts/Profile. Dashboard just
  // redirects to this board and Alerts/Profile are in the header, so the bar
  // holds the board's four sub-tabs instead (Material Req = no `?subtab=`).
  procurement: [
    { label: 'Material Req', icon: ClipboardList, path: '/procurement-board-v2' },
    { label: 'Credit Mgmt', icon: CreditCard, path: '/procurement-board-v2?subtab=credit_management' },
    { label: 'All Projects', icon: FolderKanban, path: '/procurement-board-v2?subtab=all_projects' },
    { label: 'Vendors', icon: Store, path: '/procurement-board-v2?subtab=material_vendors' },
  ],
  cre: [
    { label: 'CRE Board', icon: Target, path: '/cre-board' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
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
  // Sep 30 2026 — Profile pointed at /settings, a Super Admin page that only
  // shows "Failed to load settings" to Pre-Sales. Alerts and Profile are
  // already in the header, so the bar holds User App and Logout instead.
  pre_sales: [
    { label: 'Leads', icon: Target, path: '/crm-pre-sales' },
    { label: 'User App', icon: Users, path: '/user-app' },
    { label: 'Logout', icon: LogOut, action: 'logout' },
  ],
  // Same fix as Pre-Sales: Profile opened the Super Admin-only /settings.
  sales: [
    { label: 'Sales', icon: TrendingUp, path: '/crm-sales' },
    { label: 'User App', icon: Users, path: '/user-app' },
    { label: 'Logout', icon: LogOut, action: 'logout' },
  ],
  // Sep 30 2026 — the roles below had no entry and fell back to the Super
  // Admin bar, whose More button does nothing for them (so e.g. a Sales
  // Head on a phone could not reach Pre Sales / Sales at all).
  sales_head: [
    { label: 'Priority', icon: ListChecks, path: '/priority-board' },
    { label: 'Masterview', icon: LayoutDashboard, path: '/sales-board' },
    { label: 'Pre Sales', icon: Target, path: '/crm-pre-sales' },
    { label: 'Sales', icon: TrendingUp, path: '/crm-sales' },
  ],
  associate_pm: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/pm-dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  // Oct 31 2026 — was Planning/Alerts/Profile, with the board's six tabs in a
  // strip under the header. The bar now holds the first four tabs and More the
  // other two (Dashboard = no `?tab=`); Alerts/Profile are in the header too.
  planning_person: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/planning-board' },
    { label: 'Packages', icon: Package, path: '/planning-board?tab=packages' },
    { label: 'Vendors', icon: Store, path: '/planning-board?tab=material_vendors' },
    { label: 'Contractors', icon: HardHat, path: '/planning-board?tab=labour_contractors' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  // Oct 31 2026 — was QC/Alerts/Profile (and the QC page never rendered the
  // bar). The bar now holds the QC dashboard's four tabs (Pending Requests =
  // no `?tab=`); Notifications and Profile are in More.
  quality_check: [
    { label: 'Billing Summary', icon: Receipt, path: '/qc-dashboard?tab=billing' },
    { label: 'Pending Requests', icon: FileText, path: '/qc-dashboard' },
    { label: 'Check List', icon: ClipboardCheck, path: '/qc-dashboard?tab=checklist' },
    { label: 'Recommender', icon: Lightbulb, path: '/qc-dashboard?tab=recommender' },
    { label: 'More', icon: Menu, action: 'more' },
  ],
  hr: [
    { label: 'HR', icon: Users, path: '/hr-portal' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  marketing_head: [
    { label: 'Marketing', icon: TrendingUp, path: '/marketing-board' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  drawlead_marketing: [
    { label: 'Projects', icon: FolderKanban, path: '/marketing-projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  architect: [
    { label: 'Projects', icon: FolderKanban, path: '/architect-dashboard' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  super_architect: [
    { label: 'Workflow', icon: ListChecks, path: '/workflow-master' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
  vendor: [
    { label: 'Portal', icon: ShoppingCart, path: '/vendor-portal' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/profile' },
  ],
};

// Any role not listed above gets this rather than the Super Admin bar.
const DEFAULT_BOTTOM = [
  { label: 'Home', icon: Home, path: '/dashboard' },
  { label: 'Alerts', icon: Bell, path: '/notifications' },
  { label: 'Profile', icon: User, path: '/profile' },
];

// More-drawer icon for header nav items, picked from the path.
const PATH_ICONS = [
  ['cheque', CreditCard], ['suspense', Wallet], ['accounts', Landmark], ['finance', IndianRupee],
  ['approvals', CheckSquare], ['procurement', ShoppingCart], ['packages', FileText], ['vendor', ShoppingCart],
  ['contractor', HardHat], ['boq', ClipboardList], ['planning', Calculator], ['project', FolderKanban],
  ['pre-sales', Target], ['cre-board', Target], ['sales', TrendingUp], ['marketing', TrendingUp],
  ['user-app', Users], ['hr', Users], ['users', Users], ['gm-', Shield], ['settings', Settings],
];
const iconForPath = (path) => (PATH_ICONS.find(([k]) => path.includes(k)) || [null, LayoutDashboard])[1];

// Oct 31 2026 — the header tabs that don't fit on the bar come first, in
// header order. The old /cheque-management entry is gone: Cheque Mgmt on the
// bar opens the Accounts Board's Cheque Management tab, as the header does.
const ACCOUNTANT_MORE = [
  { label: 'Carry Forward', icon: Clock, path: '/accounts-board?tab=carry-forward' },
  { label: 'Suspense A/c', icon: Wallet, path: '/suspense-account' },
  { label: 'Other Accounts', icon: Landmark, path: '/other-accounts' },
  { label: 'Project Wise', icon: FolderKanban, path: '/accounts-board?tab=projects' },
  { label: 'HR Portal', icon: Users, path: '/hr-portal' },
  { label: 'Project Finance', icon: TrendingUp, path: '/accountant-dashboard' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
  { label: 'Profile', icon: User, path: '/profile' },
];

const CLIENT_MORE = [
  { label: 'Deductions', icon: MinusCircle, path: '/client-portal?tab=deductions' },
  { label: 'Final Estimate', icon: FileCheck, path: '/client-portal?tab=final_estimate' },
  { label: 'Scope of Work', icon: ListChecks, path: '/client-portal?tab=scope' },
  { label: 'Photos', icon: Image, path: '/client-portal?tab=photos' },
  { label: 'Documents', icon: FileText, path: '/client-portal?tab=documents' },
];

// Oct 30 2026 — gives Procurement's bar a More button, which also holds Logout.
// Oct 31 2026 — the General Manager's More starts with the same two.
const ALERTS_PROFILE_MORE = [
  { label: 'Notifications', icon: Bell, path: '/notifications' },
  { label: 'Profile', icon: User, path: '/profile' },
];

// Oct 31 2026 — the Planning Board tabs that don't fit on the bar.
const PLANNING_PERSON_MORE = [
  { label: 'RE Templates', icon: FileText, path: '/planning-board?tab=re_templates' },
  { label: 'Live Map', icon: Radio, path: '/planning-board?tab=live_map' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
  { label: 'Profile', icon: User, path: '/profile' },
];

const ROLE_MORE = {
  accountant: ACCOUNTANT_MORE, client: CLIENT_MORE, procurement: ALERTS_PROFILE_MORE,
  planning_person: PLANNING_PERSON_MORE, general_manager: ALERTS_PROFILE_MORE,
  project_manager: ALERTS_PROFILE_MORE, quality_check: ALERTS_PROFILE_MORE,
};

// `badges` — optional { [bar item path]: count } from the page, e.g. the GM
// dashboard's pending approvals, shown as a red count on that bar item.
export default function MobileBottomNav({ user, badges = {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;
  // Sep 30 2026 — pages embedded in another page (Finance Board tabs, HR
  // Portal / Settings frames) render no bar: the host page owns navigation.
  // A bar in here navigated only the frame, so e.g. More → Sales opened Sales
  // Masterview inside the Finance Board, without its header or sub-menu.
  let embedded;
  try {
    embedded = window.self !== window.top || new URLSearchParams(window.location.search).get('embedded') === '1';
  } catch { embedded = true; }
  if (embedded) return null;

  const isSuperAdmin = user.role === 'super_admin';
  const barItems = isSuperAdmin ? SA_BOTTOM : (OTHER_ROLES[user.role] || DEFAULT_BOTTOM);
  const baseMore = isSuperAdmin ? SA_MORE_ITEMS : (ROLE_MORE[user.role] || []);
  // Sep 30 2026 — the desktop header nav is hidden below `lg`, so anything it
  // offers that isn't already on the bar or in More is added to More.
  // Otherwise e.g. an accountant on a phone had no way to reach Suspense A/c.
  const seen = new Set(barItems.flatMap(i => [i.path, i.label.toLowerCase()]).filter(Boolean));
  const moreItems = baseMore
    .concat((ROLE_NAV[user.role] || []).map(i => ({ ...i, icon: iconForPath(i.path) })))
    .filter(i => {
      if (seen.has(i.path) || seen.has(i.label.toLowerCase())) return false;
      seen.add(i.path);
      seen.add(i.label.toLowerCase());
      return true;
    });
  const hasMore = moreItems.length > 0;
  const navItems = hasMore && !barItems.some(i => i.action === 'more')
    ? barItems.concat({ label: 'More', icon: Menu, action: 'more' })
    : barItems;
  
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
    if (item.action === 'logout') {
      handleLogout();
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
    if (window.__clearAuthCache) window.__clearAuthCache();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* More drawer overlay */}
      {moreOpen && hasMore && (
        <div className="lg:hidden fixed inset-0 z-[60]" data-testid="mobile-more-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-2xl border-t"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-bold text-gray-800">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="close-more-drawer">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            {/* Scrolls when a role's list is taller than a short phone. */}
            <div className="px-2 pb-3 space-y-0.5 max-h-[65vh] overflow-y-auto">
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
            // Oct 31 2026 — More also lights up while one of its pages is open.
            const active = item.path
              ? isActive(item.path)
              : item.action === 'more' && (moreOpen || moreItems.some(i => isActive(i.path)));
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => handleNav(item)}
                // Top-aligned so icons stay in one row when a label wraps.
                className={`flex flex-col items-center justify-start pt-2 flex-1 min-w-0 h-full transition-colors relative ${
                  active ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-500 rounded-b" />}
                {badges[item.path] > 0 && (
                  <span className="absolute top-1 left-1/2 ml-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center" data-testid={`mobile-nav-badge-${item.label.toLowerCase().replace(/\s/g, '-')}`}>
                    {badges[item.path]}
                  </span>
                )}
                <Icon className="h-5 w-5" />
                <span className="text-[10px] mt-0.5 font-medium text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
