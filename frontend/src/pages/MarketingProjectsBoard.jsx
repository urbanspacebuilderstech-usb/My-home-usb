import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Eye, Search, RefreshCw } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ALLOWED_ROLES = ['drawlead_marketing', 'super_admin'];

const TABS = [
  { key: 'new', label: 'New Projects', badgeCls: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'active', label: 'Current Projects', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'delivered', label: 'Delivered Projects', badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'archived', label: 'Archive Projects', badgeCls: 'bg-gray-100 text-gray-600 border-gray-200' },
];

// Collapses the 11 fine-grained construction stages into the 4 user-facing
// phases shown on the All Projects table — mirrors PlanningBoard's mapping
// so both views read the same way.
function stageToPhase(id) {
  if (!id || id === 'yet_to_start') return { name: 'Pre-Construction', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (['foundation', 'plinth'].includes(id)) return { name: 'Substructure', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (['ground_floor', 'first_floor', 'slab'].includes(id)) return { name: 'Superstructure', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (['plastering', 'flooring', 'painting', 'handover', 'completed'].includes(id)) return { name: 'Finishing', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { name: 'Pre-Construction', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
}

const dateForTab = (p, tab) => {
  const raw = tab === 'new' ? p.planning_new_date
    : tab === 'active' ? p.planning_active_date
    : tab === 'delivered' ? p.planning_delivered_date
    : tab === 'archived' ? p.archived_at
    : p.created_at;
  return raw ? new Date(raw).toLocaleDateString('en-IN') : '-';
};

export default function MarketingProjectsBoard() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('new');
  const [projects, setProjects] = useState([]);
  const [counts, setCounts] = useState({ new: 0, active: 0, delivered: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get(`${API}/auth/me`, { withCredentials: true })
      .then(res => {
        if (!ALLOWED_ROLES.includes(res.data?.role)) {
          window.location.href = '/dashboard';
          return;
        }
        setUser(res.data);
        setAuthChecked(true);
      })
      .catch(() => { window.location.href = '/login'; });
  }, []);

  const fetchCounts = async () => {
    try {
      const results = await Promise.all(
        TABS.map(t => axios.get(`${API}/planning/projects-filtered`, { params: { planning_status: t.key } }).catch(() => ({ data: [] })))
      );
      setCounts({
        new: (results[0].data || []).length,
        active: (results[1].data || []).length,
        delivered: (results[2].data || []).length,
        archived: (results[3].data || []).length,
      });
    } catch { /* silent */ }
  };

  const fetchProjects = async (tab) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/planning/projects-filtered`, { params: { planning_status: tab } });
      setProjects(res.data || []);
    } catch (err) {
      if (err?.response?.status === 401) window.location.href = '/login';
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchCounts();
    fetchProjects(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    fetchProjects(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filtered = projects.filter(p =>
    !search ||
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50">
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">All Projects</h1>
          <p className="text-sm text-gray-500">Read-only overview across every project stage</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-600" />All Projects
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 w-48 text-sm"
                  data-testid="mkt-project-search"
                />
              </div>
            </div>

            <div className="flex gap-1 mt-3 border-b">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`mkt-subtab-${tab.key}`}
                >
                  {tab.label}
                  <span
                    className={`ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold border ${tab.badgeCls}`}
                    data-testid={`mkt-subtab-${tab.key}-count`}
                  >
                    {activeTab === tab.key ? filtered.length : (counts[tab.key] ?? 0)}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="mkt-projects-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Phase</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    {activeTab !== 'archived' && (
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Planning Team</th>
                    )}
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && projects.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`sk-${i}`} className="animate-pulse">
                        <td className="px-4 py-3"><div className="h-3 w-32 bg-gray-200 rounded" /><div className="h-2.5 w-20 bg-gray-100 rounded mt-1.5" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-200 rounded mx-auto" /></td>
                        <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded mx-auto" /></td>
                        {activeTab !== 'archived' && <td className="px-4 py-3"><div className="h-3 w-16 bg-gray-200 rounded" /></td>}
                        <td className="px-4 py-3"><div className="h-7 w-16 bg-gray-200 rounded mx-auto" /></td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'archived' ? 5 : 6} className="p-8 text-center text-gray-400">
                        {activeTab === 'new' ? 'No new projects' : activeTab === 'active' ? 'No active construction projects' : activeTab === 'archived' ? 'No archived projects' : 'No delivered projects'}
                      </td>
                    </tr>
                  ) : filtered.map(p => {
                    const phase = stageToPhase(p.current_stage);
                    return (
                      <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`mkt-project-row-${p.project_id}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.location || p.project_code || '-'}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{p.client_name || '-'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block text-[11px] font-medium whitespace-nowrap px-2.5 py-1 rounded-full border ${phase.cls}`}>{phase.name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{dateForTab(p, activeTab)}</td>
                        {activeTab !== 'archived' && (
                          <td className="px-4 py-2.5 text-xs font-medium text-gray-700">{p.assigned_planning_person_name || '—'}</td>
                        )}
                        <td className="px-4 py-2.5 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => window.location.href = `/projects/${p.project_id}`}
                            data-testid={`mkt-view-${p.project_id}`}
                          >
                            <Eye className="h-3 w-3 mr-1" />View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      <MobileBottomNav user={user} />
    </div>
  );
}
