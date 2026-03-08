import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LogOut, Menu, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SUPER_ADMIN_NAV = [
  { label: 'My Dashboard', path: '/dashboard' },
  { label: 'All Projects', path: '/projects' },
  { label: 'Accounts', path: '/accounts-board', subtitle: 'Finance Board' },
  { label: 'Planning', path: '/planning-board' },
  { label: 'Marketing Board', path: '/marketing-board', subtitle: 'Lead Engine' },
  { label: 'GM', path: '/gm-dashboard' },
  { label: 'Users', path: '/users' },
  { label: 'Settings', path: '/settings' },
];

export function AppHeader({ user, unreadNotifs = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch {}
    navigate('/login', { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <header
        data-testid="app-header"
        className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          {/* Left: Logo + Brand */}
          <div
            className="flex items-center gap-2.5 cursor-pointer shrink-0"
            onClick={() => navigate('/dashboard')}
            data-testid="header-brand"
          >
            <img
              src="/logo.webp"
              alt="My Home USB"
              className="h-9 w-9 object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
            <div className="leading-tight">
              <span className="font-bold text-base text-gray-900 block">My Home USB</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                {user?.role?.replace(/_/g, ' ') || 'Super Admin'} View
              </span>
            </div>
          </div>

          {/* Center: Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-4 overflow-x-auto" data-testid="header-nav">
            {SUPER_ADMIN_NAV.map((item) => (
              <button
                key={item.path}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => navigate(item.path)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive(item.path)
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right: Notifs + User + Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/notifications')}
              className="relative h-9 w-9"
              data-testid="header-notifications"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                  {unreadNotifs}
                </span>
              )}
            </Button>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-gray-900" data-testid="header-username">{user?.name}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{user?.role?.replace(/_/g, ' ')}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-9 w-9 text-gray-400 hover:text-red-500"
                data-testid="header-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="header-mobile-toggle"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white shadow-lg" data-testid="header-mobile-menu">
            <div className="py-2 px-3 space-y-0.5">
              {SUPER_ADMIN_NAV.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMobileOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                  {item.subtitle && <span className="text-xs text-gray-400 ml-1.5">({item.subtitle})</span>}
                </button>
              ))}
              <button
                onClick={() => { navigate('/notifications'); setMobileOpen(false); }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Notifications {unreadNotifs > 0 && <span className="text-red-500 ml-1">({unreadNotifs})</span>}
              </button>
            </div>
            <div className="border-t px-3 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.role?.replace(/_/g, ' ')}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} className="text-red-500 border-red-200 hover:bg-red-50">
                <LogOut className="h-3.5 w-3.5 mr-1.5" />Logout
              </Button>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
