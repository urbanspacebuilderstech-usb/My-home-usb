import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import RABApprovalQueue from '../components/RABApprovalQueue';
import {
  ShieldCheck, FileText, Receipt, ClipboardCheck, Lightbulb, Building2,
  MapPin, User as UserIcon, ChevronRight, Loader2,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Four round-pill tabs requested by user
const TABS = [
  { value: 'billing',      label: 'Billing Summary',  Icon: Receipt,         color: 'emerald' },
  { value: 'pending',      label: 'Pending Requests', Icon: FileText,        color: 'amber'   },
  { value: 'checklist',    label: 'Check List',       Icon: ClipboardCheck,  color: 'sky'     },
  { value: 'recommender',  label: 'Recommender',      Icon: Lightbulb,       color: 'violet'  },
];

export default function QCDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('pending');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/auth/me`);
        if (!['quality_check', 'super_admin'].includes(res.data.role)) {
          toast.error('Access denied');
          window.location.href = '/dashboard';
          return;
        }
        setUser(res.data);
        const projRes = await axios.get(`${API}/qc/projects`).catch(() => ({ data: [] }));
        setProjects(projRes.data || []);
      } catch (err) {
        if (err.response?.status === 401) window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openProject = (pid) => {
    // QC-restricted project view — only Project Stages tab is rendered (see ProjectDetail.jsx role gate).
    navigate(`/projects/${pid}?tab=project-stages&qc=1`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-12 flex items-center justify-center text-gray-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading QC Dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="qc-dashboard">
      <AppHeader user={user} />
      <main className="max-w-6xl mx-auto px-4 py-4 sm:px-6">
        {/* Title */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-cyan-600" /> QC Checking Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Review labour RAB requests, run checklists, and audit assigned project stages.</p>
        </div>

        {/* Round / Pill Tabs */}
        <div className="flex flex-wrap gap-2 mb-5" data-testid="qc-tabs">
          {TABS.map(({ value, label, Icon, color }) => {
            const active = tab === value;
            return (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  active
                    ? `bg-${color}-600 text-white border-${color}-600 shadow-sm`
                    : `bg-white text-gray-700 border-gray-200 hover:border-${color}-300 hover:bg-${color}-50`
                }`}
                data-testid={`qc-tab-${value}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="mb-5">
          {tab === 'pending' && <RABApprovalQueue role="quality_check" />}
          {tab === 'billing' && <ComingSoon label="Billing Summary" hint="Project-wise paid vs pending billing roll-up will appear here." />}
          {tab === 'checklist' && <ComingSoon label="Check List" hint="Stage-wise quality check checklists with photo evidence will appear here." />}
          {tab === 'recommender' && <ComingSoon label="Recommender" hint="Smart recommendations on contractor performance, defect trends & corrective actions." />}
        </div>

        {/* Assigned Projects List */}
        <Card>
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-cyan-600" /> Projects Assigned for QC Checking
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Planning assigns these via the project Team tab. Click any project to open its Stages.</p>
            </div>
            <Badge variant="outline" className="text-xs">{projects.length}</Badge>
          </div>
          <CardContent className="p-0">
            {projects.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <Building2 className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                No projects assigned for QC yet.
              </div>
            ) : (
              <ul className="divide-y" data-testid="qc-projects-list">
                {projects.map((p) => (
                  <li
                    key={p.project_id}
                    onClick={() => openProject(p.project_id)}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                    data-testid={`qc-project-${p.project_id}`}
                  >
                    <div className="h-9 w-9 rounded-full bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700 font-semibold text-sm shrink-0">
                      {(p.client_name || p.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm text-gray-900 truncate">{p.name}</h3>
                        {p.project_code && (
                          <Badge variant="outline" className="text-[10px] font-mono">{p.project_code}</Badge>
                        )}
                        {p.status && (
                          <Badge variant="outline" className="text-[10px] capitalize">{(p.status || '').replace(/_/g, ' ')}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> {p.client_name || '—'}</span>
                        {p.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.location}</span>}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ComingSoon({ label, hint }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <Lightbulb className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{hint}</p>
        <Badge variant="outline" className="mt-3 text-[10px]">Coming Soon</Badge>
      </CardContent>
    </Card>
  );
}
