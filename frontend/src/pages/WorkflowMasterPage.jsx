import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Workflow, Users as UsersIcon, Cog, ShieldCheck } from 'lucide-react';
import WorkflowMasterPanel from '../components/WorkflowMasterPanel';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Workflow Master — landing page for the Super Architect role.
 *
 * The page reuses the same WorkflowMasterPanel component that the Super Admin
 * sees inside Settings → Workflow Master Setup, so Super Architect gets the
 * full Users / Workflows / Functions experience as their main home page.
 */
export default function WorkflowMasterPage() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/auth/me`)
      .then(r => { if (!cancelled) setUser(r.data); })
      .catch(() => navigate('/login'));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-24" data-testid="workflow-master-page">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Workflow className="h-6 w-6 sm:h-7 sm:w-7 text-indigo-600" /> Workflow Master Setup
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Control which menus each role sees on their dashboard. Toggle visibility, drag to reorder.
            </p>
          </div>
          <div className="text-xs uppercase font-semibold text-indigo-700 bg-indigo-100 rounded-full px-3 py-1 self-start sm:self-end">
            <ShieldCheck className="h-3 w-3 inline mr-1" /> Super Architect Workspace
          </div>
        </div>

        <WorkflowMasterPanel />
      </div>

      <MobileBottomNav user={user} />
    </div>
  );
}
