import { Building2, LayoutDashboard, FolderKanban, ClipboardList, CheckSquare, ShoppingCart, Camera, DollarSign, Users, Bell, LogOut, X, Calculator, Briefcase, FileText, Target, UserCheck, Shield, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Sidebar({ open, onClose, user }) {
  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['super_admin', 'project_manager', 'planning', 'accountant', 'cre', 'procurement'] },
    { name: 'GM Command Center', icon: Shield, path: '/gm-dashboard', roles: ['super_admin', 'general_manager'] },
    { name: 'CRE Board', icon: UserCog, path: '/cre-board', roles: ['super_admin', 'cre'] },
    { name: 'CRM Pre-Sales', icon: UserCheck, path: '/crm-pre-sales', roles: ['super_admin', 'pre_sales', 'cre'] },
    { name: 'CRM Sales', icon: Target, path: '/crm-sales', roles: ['super_admin', 'sales', 'cre'] },
    { name: 'RE Projects', icon: Calculator, path: '/crm/re-projects', roles: ['super_admin', 'planning', 'general_manager', 'sales'] },
    { name: 'Projects', icon: FolderKanban, path: '/projects', roles: ['super_admin', 'project_manager', 'planning', 'cre', 'general_manager'] },
    { name: 'Work Orders', icon: ClipboardList, path: '/work-orders', roles: ['super_admin', 'project_manager', 'procurement'] },
    { name: 'Approvals', icon: CheckSquare, path: '/approvals', roles: ['accountant'] },
    { name: 'Procurement', icon: ShoppingCart, path: '/procurement', roles: ['super_admin', 'procurement'] },
    { name: 'Site Receipt', icon: Camera, path: '/site-receipt', roles: ['site_engineer'] },
    { name: 'Expenses', icon: DollarSign, path: '/expenses', roles: ['super_admin', 'accountant'] },
    { name: 'Accountant Dashboard', icon: Calculator, path: '/accountant-dashboard', roles: ['super_admin', 'accountant'] },
    { name: 'HR Portal', icon: Briefcase, path: '/hr-portal', roles: ['super_admin', 'accountant'] },
    { name: 'Cheques', icon: FileText, path: '/cheque-management', roles: ['super_admin', 'accountant'] },
    { name: 'Users', icon: Users, path: '/users', roles: ['super_admin'] },
    { name: 'Notifications', icon: Bell, path: '/notifications', roles: ['all'] },
  ];

  const filteredItems = menuItems.filter(
    item => item.roles.includes('all') || item.roles.includes(user?.role)
  );

  return (
    <>
      {open && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-secondary text-secondary-foreground z-50
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="p-6 flex items-center justify-between border-b border-secondary-foreground/10">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">ConstructionOS</span>
          </div>
          <Button
            data-testid="close-sidebar-btn"
            variant="ghost"
            size="icon"
            className="md:hidden text-secondary-foreground"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-2">
          {filteredItems.map((item) => (
            <a
              key={item.path}
              data-testid={`sidebar-${item.name.toLowerCase().replace(' ', '-')}`}
              href={item.path}
              className="flex items-center gap-3 px-4 py-3 rounded-sm hover:bg-secondary-foreground/10 transition-colors text-secondary-foreground"
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </a>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-secondary-foreground/10">
          <div className="mb-4 px-4">
            <p className="text-sm font-medium text-secondary-foreground">{user?.name}</p>
            <p className="text-xs text-secondary-foreground/60">{user?.email}</p>
          </div>
          <Button
            data-testid="logout-btn"
            variant="outline"
            className="w-full justify-start gap-2 text-secondary-foreground border-secondary-foreground/20"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
    </>
  );
}