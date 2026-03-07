import { useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, FolderKanban, Bell, User, Package, 
  Camera, ShoppingCart, CheckSquare, DollarSign, Shield,
  Home, CreditCard, Menu, HardHat, Calculator, Target
} from 'lucide-react';
import { useState } from 'react';
import Sidebar from './Sidebar';

const ROLE_NAV_CONFIG = {
  super_admin: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'GM Center', icon: Shield, path: '/gm-dashboard' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  general_manager: [
    { label: 'Command', icon: Shield, path: '/gm-dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  project_manager: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  planning: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Planning', icon: Calculator, path: '/planning-board' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  site_engineer: [
    { label: 'Projects', icon: HardHat, path: '/site-engineer' },
    { label: 'Receipt', icon: Camera, path: '/site-engineer/material-receipt' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/settings' },
  ],
  procurement: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Procurement', icon: ShoppingCart, path: '/procurement-board-v2' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  accountant: [
    { label: 'Accounts', icon: Calculator, path: '/accountant-dashboard' },
    { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { label: 'Expenses', icon: DollarSign, path: '/expenses' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  cre: [
    { label: 'CRE Board', icon: Target, path: '/cre-board' },
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'More', icon: Menu, action: 'sidebar' },
  ],
  client: [
    { label: 'Overview', icon: Home, path: '/client-portal' },
    { label: 'Payments', icon: CreditCard, path: '/client-portal' },
    { label: 'Alerts', icon: Bell, path: '/notifications' },
    { label: 'Profile', icon: User, path: '/settings' },
  ],
};

const DEFAULT_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Projects', icon: FolderKanban, path: '/projects' },
  { label: 'Alerts', icon: Bell, path: '/notifications' },
  { label: 'More', icon: Menu, action: 'sidebar' },
];

export default function MobileBottomNav({ user }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  if (!user) return null;
  
  const navItems = ROLE_NAV_CONFIG[user.role] || DEFAULT_NAV;
  
  const isActive = (path) => {
    if (path === '/dashboard' && location.pathname === '/dashboard') return true;
    if (path !== '/dashboard' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const handleClick = (item) => {
    if (item.action === 'sidebar') {
      setSidebarOpen(true);
    } else {
      window.location.href = item.path;
    }
  };

  return (
    <>
      {/* Sidebar for "More" menu */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      
      {/* Bottom spacer to prevent content from hiding behind nav */}
      <div className="md:hidden h-16" />
      
      {/* Bottom Navigation */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom"
        data-testid="mobile-bottom-nav"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const active = item.path ? isActive(item.path) : false;
            const Icon = item.icon;
            
            return (
              <button
                key={item.label}
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => handleClick(item)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  active 
                    ? 'text-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : ''}`} />
                <span className={`text-[10px] mt-0.5 font-medium ${active ? 'text-blue-600' : ''}`}>
                  {item.label}
                </span>
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-b" />}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
