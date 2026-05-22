import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  LogOut,
  Home,
  FileText,
  Banknote,
  Receipt,
  ListChecks,
  Building2,
  MapPin,
  ChevronRight,
  Calendar,
  IndianRupee,
  FolderOpen,
  Download,
  Eye,
  Hammer,
  CheckCircle2,
  Clock,
  CalendarClock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

const FOOTER_TABS = [
  { id: 'estimates', label: 'Estimates', icon: FileText },
  { id: 'pre',       label: 'Pre-Const', icon: Hammer },
  { id: 'stages',    label: 'Stages',    icon: ListChecks },
  { id: 'schedule',  label: 'Schedule',  icon: Calendar },
  { id: 'income',    label: 'Payments',  icon: Receipt },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
];

// =========================================================
// Top-level: handles auth gate + project list + selected project
// =========================================================
export default function ClientPortalV2() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/auth/me`);
        if (res.data?.role !== 'client') {
          toast.error('This portal is for clients only');
          window.location.href = '/login';
          return;
        }
        setUser(res.data);
        const p = await axios.get(`${API}/client-portal/my-projects`);
        const list = p.data || [];
        setProjects(list);
        if (projectId) {
          setSelected(list.find(x => x.project_id === projectId) || null);
        } else if (list.length === 1) {
          setSelected(list[0]);
        }
      } catch {
        // not logged in → show login screen
      } finally {
        setAuthChecking(false);
      }
    })();
  }, [projectId]);

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch { /* */ }
    setUser(null);
    setProjects([]);
    setSelected(null);
    navigate('/client');
  };

  if (authChecking) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-xs text-gray-500">Loading…</div>;
  }

  if (!user) {
    return <ClientLoginScreen onLogin={(u) => { setUser(u); window.location.reload(); }} />;
  }

  if (!selected) {
    return <ProjectListScreen user={user} projects={projects} onPick={(p) => navigate(`/client/${p.project_id}`)} onLogout={handleLogout} />;
  }

  return <ProjectDetailScreen user={user} project={selected} onBack={() => navigate('/client')} onLogout={handleLogout} />;
}

// =========================================================
// Login screen — mobile-only styled
// =========================================================
function ClientLoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!email || !password) { toast.error('Enter email and password'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/auth/login`, { email: email.trim().toLowerCase(), password });
      const u = res.data?.user || res.data || {};
      if (u.role !== 'client') {
        toast.error('This account is not a client account');
        return;
      }
      onLogin(u);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-amber-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl shadow-lg mb-3">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Client Portal</h1>
          <p className="text-xs text-gray-500 mt-1">Track your project anytime</p>
        </div>
        <Card className="shadow-xl border-0">
          <CardContent className="p-6">
            <form className="space-y-3" onSubmit={submit}>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="username"
                  className="text-sm mt-1 h-11"
                  data-testid="cp-login-email"
                />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="text-sm mt-1 h-11"
                  data-testid="cp-login-password"
                />
              </div>
              <Button type="submit" className="w-full h-11 bg-amber-600 hover:bg-amber-700 mt-2" disabled={submitting} data-testid="cp-login-submit">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-[11px] text-center text-gray-500 mt-6">Need help? Contact your CRE</p>
      </div>
    </div>
  );
}

// =========================================================
// Project list (only when client has multiple projects)
// =========================================================
function ProjectListScreen({ user, projects, onPick, onLogout }) {
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <header className="bg-white border-b sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Welcome</p>
          <p className="text-sm font-bold">{user?.name || 'Client'}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onLogout} data-testid="cp-logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>
      <div className="p-3 space-y-2">
        <h2 className="text-xs font-semibold text-gray-700 px-1">Your Projects</h2>
        {projects.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-xs text-gray-400">No projects assigned to your account yet</CardContent></Card>
        ) : projects.map(p => (
          <Card key={p.project_id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onPick(p)} data-testid={`cp-project-${p.project_id}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500 truncate flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.location || '—'}</p>
                <p className="text-[10px] text-amber-700 mt-0.5">{fmt(p.total_value)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// Project detail screen — header + tab content + footer nav
// =========================================================
function ProjectDetailScreen({ user, project, onBack, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('estimates');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/client-portal/project/${project.project_id}`);
        setData(res.data);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to load project');
      } finally { setLoading(false); }
    })();
  }, [project.project_id]);

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-20">
      <header className="bg-white border-b sticky top-0 z-30 px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide truncate">Project</p>
          <p className="text-sm font-bold truncate">{project.name}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onLogout} data-testid="cp-logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Top summary card */}
      <div className="p-3">
        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase opacity-80">Project Value</p>
            <p className="text-2xl font-bold mb-2">{fmt(project.total_value)}</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white/15 rounded px-2 py-1.5 backdrop-blur-sm">
                <p className="opacity-80">Received</p>
                <p className="font-bold">{fmt(data?.total_income || data?.total_paid)}</p>
              </div>
              <div className="bg-white/15 rounded px-2 py-1.5 backdrop-blur-sm">
                <p className="opacity-80">Balance</p>
                <p className="font-bold">{fmt((project.total_value || 0) - (data?.total_income || data?.total_paid || 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab content */}
      <div className="px-3 pb-4">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-xs text-gray-400">Loading…</CardContent></Card>
        ) : (
          <>
            {tab === 'estimates' && <EstimatesTab data={data} />}
            {tab === 'pre' && <PreConstructionTab data={data} />}
            {tab === 'stages' && <StagesTab data={data} />}
            {tab === 'schedule' && <ScheduleTab data={data} />}
            {tab === 'income' && <IncomeTab data={data} />}
            {tab === 'documents' && <DocumentsTab data={data} />}
          </>
        )}
      </div>

      {/* Footer Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30">
        <div className="max-w-md mx-auto grid grid-cols-6">
          {FOOTER_TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${active ? 'text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                data-testid={`cp-tab-${t.id}`}
              >
                <Icon className={`h-4 w-4 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[9px] font-medium">{t.label}</span>
                {active && <div className="absolute top-0 w-8 h-0.5 bg-amber-600 rounded-b" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ----- TABS -----
function EstimatesTab({ data }) {
  const items = data?.scope_items || [];
  // Sub-total for the footer
  const subTotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-700 px-1 uppercase">Final Estimates</h3>
      {items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No estimate items yet</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map((it, i) => (
                <div key={i} className="px-3 py-2.5">
                  <p className="text-sm font-medium text-gray-900">{it.name || it.item_name || it.description || '—'}</p>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
                    <span>{it.quantity} {it.unit}{(it.rate || it.unit_rate) ? ` · @ ${fmt(it.rate || it.unit_rate)}` : ''}</span>
                    <span className="font-bold text-amber-700">{fmt(it.total ?? it.total_amount ?? 0)}</span>
                  </div>
                </div>
              ))}
              <div className="px-3 py-2.5 bg-amber-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase">Estimate Total</span>
                <span className="text-base font-bold text-amber-800">{fmt(subTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreConstructionTab({ data }) {
  const items = data?.pre_construction || [];
  const completed = items.filter(it => it.status === 'completed').length;
  return (
    <div className="space-y-2" data-testid="pre-construction-tab">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-gray-700 uppercase">Pre-Construction</h3>
        <span className="text-[11px] text-gray-500">{completed} of {items.length} done</span>
      </div>
      {items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">Pre-construction tracking will appear here once your CRE starts updates.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map(it => {
                const Icon = it.status === 'completed' ? CheckCircle2 : (it.status === 'scheduled' ? CalendarClock : Clock);
                const accent = it.status === 'completed' ? 'text-emerald-600' : (it.status === 'scheduled' ? 'text-blue-600' : 'text-gray-400');
                const badgeCls = it.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : (it.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200');
                return (
                  <div key={it.key} className="px-3 py-3 flex items-start gap-3" data-testid={`pre-construction-item-${it.key}`}>
                    <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${accent}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{it.label}</p>
                        <Badge variant="outline" className={`text-[10px] ${badgeCls}`}>{it.status === 'completed' ? 'Completed' : (it.status === 'scheduled' ? 'Scheduled' : 'Pending')}</Badge>
                      </div>
                      {it.scheduled_at && it.status === 'scheduled' && (
                        <p className="text-[11px] text-gray-500 mt-0.5">Scheduled for {fmtDate(it.scheduled_at)}</p>
                      )}
                      {it.completed_at && it.status === 'completed' && (
                        <p className="text-[11px] text-gray-500 mt-0.5">Completed on {fmtDate(it.completed_at)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StagesTab({ data }) {
  const stages = data?.stages || [];
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-700 px-1 uppercase">Construction Stages</h3>
      {stages.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No stage updates yet</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {stages.map((s, i) => (
                <div key={i} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{s.name || s.stage_name || `Stage ${i + 1}`}</p>
                    <Badge variant="outline" className={`text-[9px] ${s.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{s.status || 'pending'}</Badge>
                  </div>
                  {s.completed_at && <p className="text-[10px] text-gray-500 mt-0.5">Completed {fmtDate(s.completed_at)}</p>}
                  {s.description && <p className="text-[11px] text-gray-600 mt-1">{s.description}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScheduleTab({ data }) {
  const stages = data?.payment_stages || [];
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-700 px-1 uppercase">Payment Schedule</h3>
      {stages.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No payment schedule</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {stages.map((s, i) => {
                const recv = s.amount_received || 0;
                const paid = recv >= (s.amount || 0) && (s.amount || 0) > 0;
                return (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{i + 1}. {s.name || s.stage}</p>
                      <Badge variant="outline" className={`text-[9px] ${paid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {paid ? 'Paid' : 'Pending'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1.5 text-[11px]">
                      <div><p className="text-gray-500">Amount</p><p className="font-bold text-gray-900">{fmt(s.amount)}</p></div>
                      <div><p className="text-gray-500">Received</p><p className="font-bold text-green-700">{fmt(recv)}</p></div>
                    </div>
                    {s.due_date && <p className="text-[10px] text-gray-500 mt-1">Due {fmtDate(s.due_date)}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IncomeTab({ data }) {
  const entries = data?.income_entries || [];
  const total = data?.total_income || 0;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-700 px-1 uppercase">Payment Summary</h3>
      <Card className="border-green-200 bg-green-50/40">
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-green-700 uppercase">Total Received</p>
            <p className="text-xl font-bold text-green-800">{fmt(total)}</p>
          </div>
          <IndianRupee className="h-7 w-7 text-green-500" />
        </CardContent>
      </Card>
      {entries.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No payments received yet</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {entries.map((e, i) => (
                <div key={i} className="px-3 py-2.5 flex items-center justify-between gap-2" data-testid={`cp-income-${i}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{fmtDate(e.payment_date)}</p>
                    {e.description && <p className="text-[11px] text-gray-500 truncate">{e.description}</p>}
                    {e.payment_mode && <Badge variant="outline" className="text-[9px] mt-0.5 capitalize">{e.payment_mode.replace('_', ' ')}</Badge>}
                  </div>
                  <p className="font-bold text-green-700 text-sm shrink-0">{fmt(e.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocumentsTab({ data }) {
  const docs = data?.documents || [];
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-700 px-1 uppercase">Documents</h3>
      {docs.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No documents shared yet</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {docs.map((d, i) => {
                const url = d.url || (d.file_id ? `${API}/files/${d.file_id}/download` : null);
                return (
                  <a
                    key={i}
                    href={url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                    data-testid={`cp-doc-${i}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.title || d.name || d.filename}</p>
                      <p className="text-[10px] text-gray-500">{d.created_at ? fmtDate(d.created_at) : ''}</p>
                    </div>
                    <Download className="h-4 w-4 text-gray-400" />
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
