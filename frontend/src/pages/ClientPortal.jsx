import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Building2,
  LogOut,
  Home,
  IndianRupee,
  Image,
  FileText,
  Clock,
  Printer,
  ChevronLeft,
  CheckCircle2,
  Circle,
  ArrowRight,
  Wallet,
  TrendingUp,
  Package,
  MapPin,
  Calendar,
  CalendarCheck,
  User,
  Receipt,
  Layers,
  TrendingDown,
  AlertCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  LayoutDashboard,
  FileCheck,
  PlusCircle,
  MinusCircle,
  ListChecks
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Construction stage definitions
const CONSTRUCTION_STAGES = [
  { id: 'drawing', label: 'Drawing', order: 1 },
  { id: 'foundation', label: 'Foundation', order: 2 },
  { id: 'basement', label: 'Basement', order: 3 },
  { id: 'superstructure', label: 'Superstructure', order: 4 },
  { id: 'brick_work', label: 'Brick Work', order: 5 },
  { id: 'plastering', label: 'Plastering', order: 6 },
  { id: 'flooring', label: 'Flooring', order: 7 },
  { id: 'finishing', label: 'Finishing', order: 8 }
];

// Derive the high-level Phase the project is in based on the planning
// `current_stage` value. Mirrors the reverse mapping used by Planning's Phase
// dropdown in ProjectDetail.jsx — keep these two in lock-step so the badge
// the client sees always matches the option Planning picked.
const PHASE_STYLES = {
  pre_construction: { label: 'Pre-Construction', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  substructure:     { label: 'Substructure',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  superstructure:   { label: 'Superstructure',   cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  finishing:        { label: 'Finishing',        cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};
function getProjectPhase(project) {
  const id = (project?.current_stage || project?.construction_stage || 'yet_to_start');
  if (id === 'yet_to_start') return 'pre_construction';
  if (['foundation', 'plinth'].includes(id)) return 'substructure';
  if (['ground_floor', 'first_floor', 'slab', 'superstructure', 'brick_work', 'basement'].includes(id)) return 'superstructure';
  if (['plastering', 'flooring', 'painting', 'handover', 'completed', 'finishing'].includes(id)) return 'finishing';
  return 'pre_construction';
}

export default function ClientPortal() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const printRef = useRef();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  // Decision dialog state — proper modal instead of window.prompt
  // `kind` distinguishes the entity ('addition' is default for back-compat; 'deduction' for deductions).
  const [decisionDialog, setDecisionDialog] = useState({ open: false, mode: null, kind: 'addition', costId: null, name: '', text: '', submitting: false });
  // Pending Dues drill-down modal — opens when client clicks the "Pending Dues"
  // section on the top financial strip. Lists every payment stage whose
  // expected_payment_date is in the past and still carries a balance.
  const [pendingDuesDialog, setPendingDuesDialog] = useState({ open: false });

  useEffect(() => {
    fetchUserAndProjects();
  }, []);

  useEffect(() => {
    if (projectId && user) {
      fetchProjectData(projectId);
    }
  }, [projectId, user]);

  const fetchUserAndProjects = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);

      // Get all projects for this client
      const projRes = await axios.get(`${API}/client-portal/my-projects`);
      setProjects(projRes.data || []);
      
      // If we have a projectId in URL, select it
      if (projectId) {
        const proj = (projRes.data || []).find(p => p.project_id === projectId);
        if (proj) {
          setSelectedProject(proj);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoading(false);
    }
  };

  const fetchProjectData = async (pid) => {
    try {
      const res = await axios.get(`${API}/client-portal/project/${pid}`);
      setProjectData(res.data);
      setSelectedProject(res.data.project);
    } catch (error) {
      console.error('Failed to fetch project data:', error);
      toast.error('Failed to load project details');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const selectProject = (proj) => {
    setSelectedProject(proj);
    navigate(`/client-portal/${proj.project_id}`);
    fetchProjectData(proj.project_id);
  };

  // Approve / reject Additional Work line items
  const handleClientApproveAddition = async (costId) => {
    try {
      const res = await axios.post(`${API}/client-portal/additional-costs/${costId}/approve`);
      toast.success(res.data?.message || 'Approved');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
  };
  const handleClientRejectAddition = async (costId) => {
    const reason = window.prompt('Please share a brief reason for rejecting this work:', '');
    if (reason === null) return;
    try {
      const res = await axios.post(`${API}/client-portal/additional-costs/${costId}/reject`, { reason });
      toast.success(res.data?.message || 'Rejection recorded');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to reject');
    }
  };

  // Pre-payment client approval (the new "Send to Client" flow). Decision made
  // BEFORE Planning hits Req Payment. Reason mandatory on reject.
  const handlePreApproveAddition = async (costId) => {
    try {
      await axios.post(`${API}/additional-costs/${costId}/client-decision`, { decision: 'approve' });
      toast.success('Approved — Planning can now request payment');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
  };
  const handlePreRejectAddition = (cost) => {
    setDecisionDialog({ open: true, mode: 'reject', costId: cost.cost_id, name: cost.name || cost.description || 'this item', text: '', submitting: false });
  };
  // Client asks Planning for a review/clarification before approving.
  // Opens a proper styled dialog instead of native window.prompt.
  const handleClientRequestReview = (cost) => {
    setDecisionDialog({ open: true, mode: 'review', costId: cost.cost_id, name: cost.name || cost.description || 'this item', text: '', submitting: false });
  };

  const submitDecisionDialog = async () => {
    const { mode, kind, costId, text } = decisionDialog;
    const value = (text || '').trim();
    if (!value) {
      toast.error(mode === 'reject' ? 'Reason is required to reject' : 'Please share a short note so Planning knows what to clarify');
      return;
    }
    setDecisionDialog(d => ({ ...d, submitting: true }));
    try {
      if (kind === 'deduction') {
        // Deductions only support reject from the client portal (approve is one-click).
        await axios.post(`${API}/deductions/${costId}/client-reject`, { reason: value });
        toast.success('Rejection recorded');
      } else if (mode === 'reject') {
        await axios.post(`${API}/additional-costs/${costId}/client-decision`, { decision: 'reject', reason: value });
        toast.success('Rejection recorded');
      } else {
        await axios.post(`${API}/client-portal/additional-costs/${costId}/request-review`, { note: value });
        toast.success('Review request sent to Planning');
      }
      setDecisionDialog({ open: false, mode: null, kind: 'addition', costId: null, name: '', text: '', submitting: false });
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || (mode === 'reject' ? 'Failed to reject' : 'Failed to send review request'));
      setDecisionDialog(d => ({ ...d, submitting: false }));
    }
  };

  // ── Deduction Approve / Reject (client portal) ──────────────────────
  // Approve: one-click POST to backend client-approve endpoint.
  // Reject:  opens the styled decision dialog (kind='deduction') so the
  // client must enter a reason, mirroring the Additional Work flow.
  const handleClientApproveDeduction = async (ded) => {
    try {
      await axios.post(`${API}/deductions/${ded.deduction_id}/client-approve`);
      toast.success('Deduction approved');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
  };
  const handleClientRejectDeduction = (ded) => {
    setDecisionDialog({
      open: true,
      mode: 'reject',
      kind: 'deduction',
      costId: ded.deduction_id,
      name: ded.description || ded.name || 'this deduction',
      text: '',
      submitting: false,
    });
  };
  // Section batch decision (one click approves every addition inside).
  const handleSectionDecision = async (sectionId, decision) => {
    let reason = null;
    if (decision === 'reject') {
      reason = window.prompt('Please share a brief reason for rejecting the entire section:', '');
      if (reason === null) return;
      if (!reason.trim()) { toast.error('Reason is required to reject'); return; }
    }
    try {
      await axios.post(`${API}/projects/${projectId}/addition-sections/${sectionId}/client-decision`, { decision, reason });
      toast.success(decision === 'approve' ? 'Section approved' : 'Section rejected');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || `Failed to ${decision}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your projects...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="p-8 text-center">
          <p className="text-gray-600 mb-4">Please login to access your project portal</p>
          <Button onClick={() => navigate('/login')}>Go to Login</Button>
        </Card>
      </div>
    );
  }

  // Project list view if no project selected
  if (!projectId || !projectData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <img src="/logo.webp" alt="My Home USB" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{mixBlendMode: "multiply"}} />
              <div>
                <h1 className="text-base sm:text-xl font-bold text-gray-900">My Home USB</h1>
                <p className="text-xs text-gray-500">Client Portal</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">Client</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 sm:h-10 sm:w-10">
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-8">
          <h2 className="text-2xl font-bold mb-6">My Projects</h2>

          {projects.length === 0 ? (
            <Card className="p-8 text-center">
              <Home className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No projects linked to your account yet.</p>
              <p className="text-sm text-gray-400 mt-2">Contact your project manager to get access.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {projects.map((proj) => (
                <Card 
                  key={proj.project_id} 
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => selectProject(proj)}
                  data-testid={`project-card-${proj.project_id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">{proj.name}</h3>
                        <p className="text-sm text-gray-500">{proj.location}</p>
                        <Badge className="mt-2" variant={proj.status === 'active' ? 'default' : 'secondary'}>
                          {proj.construction_stage || proj.status}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Project Value</p>
                        <p className="text-xl font-bold text-amber-600">₹{(proj.total_value / 100000).toFixed(2)}L</p>
                        <ArrowRight className="h-5 w-5 text-gray-400 ml-auto mt-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const project = projectData.project;
  const paymentStages = projectData.payment_stages || [];
  const scopeItems = projectData.scope_items || [];
  const additionalCosts = projectData.additional_costs || [];
  const deductions = projectData.deductions || [];
  const photos = projectData.photos || [];
  const documents = projectData.documents || [];

  // Calculate totals
  const totalScheduled = paymentStages.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalReceived = paymentStages.reduce((sum, s) => sum + (s.amount_received || 0), 0);
  const balance = totalScheduled - totalReceived;
  const progressPercent = totalScheduled > 0 ? Math.min(100, Math.round((totalReceived / totalScheduled) * 100)) : 0;
  const totalAdditional = additionalCosts.reduce((sum, c) => sum + (c.estimated_amount || c.actual_amount || 0), 0);
  const totalAdditionalReceived = additionalCosts.reduce((sum, c) => sum + (c.income_received || 0), 0);
  const totalDeductions = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);

  // Pending payment dues — stages with remaining balance > 0 (i.e. not fully paid)
  const pendingDueStages = paymentStages.filter(s => ((s.amount || 0) - (s.amount_received || 0)) > 0);
  const pendingDueCount = pendingDueStages.length;
  // Nearest upcoming due date among pending stages
  const nearestDueDate = pendingDueStages
    .filter(s => s.due_date)
    .map(s => new Date(s.due_date))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // Get current construction stage
  const currentStageIndex = CONSTRUCTION_STAGES.findIndex(s => s.id === project.construction_stage);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Navigation - hidden in print */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/client-portal')} className="h-8 w-8 sm:h-10 sm:w-10">
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <img src="/logo.webp" alt="My Home USB" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{mixBlendMode: "multiply"}} />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900">My Home USB</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Client Portal</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button 
              variant="outline" 
              className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-10 px-2 sm:px-4"
              onClick={handlePrintPDF}
              data-testid="print-pdf-btn"
            >
              <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Share as</span> PDF
            </Button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">Client</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 sm:h-10 sm:w-10">
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Print Header - only visible in print */}
      <div className="hidden print:block p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Home USB</h1>
            <p className="text-gray-500">Project Report</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString('en-IN')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-4 sm:px-6 sm:py-8" ref={printRef}>
        {/* Project Header */}
        <div className="mb-6 sm:mb-8 print:break-inside-avoid">
          <h2 data-testid="client-portal-title" className="text-xl sm:text-3xl font-bold text-gray-900">{project.name}</h2>
          <div className="flex items-center gap-2 sm:gap-4 mt-2 flex-wrap">
            <span className="text-gray-600">{project.location}</span>
            {/* Status badge now mirrors the Planning Phase — so when Planning
                changes the project Phase to e.g. Pre-Construction, the client
                immediately sees the same label here. Falls back to project.status
                only if no current_stage / construction_stage is set yet. */}
            {(() => {
              const phaseKey = getProjectPhase(project);
              const phase = PHASE_STYLES[phaseKey];
              return (
                <Badge
                  className={`font-semibold border ${phase.cls}`}
                  data-testid="client-portal-phase-badge"
                >
                  {phase.label}
                </Badge>
              );
            })()}
            {project.construction_stage && (
              <Badge className="bg-amber-50 text-amber-700">
                Stage: {CONSTRUCTION_STAGES.find(s => s.id === project.construction_stage)?.label || project.construction_stage}
              </Badge>
            )}
          </div>
        </div>

        {/* Top-level Cheque Bounce Alert — visible across all tabs so the
            client never misses a returned-cheque notification. Sourced from
            db.cheques (Cheque Management module) — these are the real bounce
            records, not just db.income status flags. */}
        {(() => {
          const bouncedCheques = projectData?.bounced_cheques || [];
          if (bouncedCheques.length === 0) return null;
          const bouncedTotal = bouncedCheques.reduce((s, c) => s + (c.amount || 0), 0);
          return (
            <button
              type="button"
              onClick={() => setActiveTab('income')}
              className="w-full mb-6 group rounded-xl border border-red-300 bg-gradient-to-r from-red-50 to-red-100/50 px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-all text-left"
              data-testid="cp-global-bounce-alert"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-red-200 flex items-center justify-center shrink-0 animate-pulse">
                <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-red-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-bold text-red-900">
                  {bouncedCheques.length} Cheque{bouncedCheques.length > 1 ? 's' : ''} Bounced — Action Required
                </p>
                <p className="text-xs sm:text-sm text-red-700 mt-0.5">
                  Total bounced: ₹{bouncedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}. Please arrange an alternate payment.
                </p>
              </div>
              <div className="shrink-0 text-red-700 font-medium text-xs sm:text-sm flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                View details
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          );
        })()}

        {/* Financial Summary — Scope / Additions / Deductions / Grand Total /
            Total Income / Yet to Receive. Mirrors the Project Detail (Admin)
            Financial Performance card so the client always sees the latest
            figure. We intentionally HIDE Total Expense and Total Balance from
            this view — clients shouldn't see vendor-side spend. */}
        {(() => {
          const additionsTotal = additionalCosts
            .filter(c => (c.kind || '') !== 'deduction')
            .reduce((s, c) => s + (((c.qty || 0) * (c.price || 0)) || c.estimated_amount || c.actual_amount || 0), 0);
          const deductionsTotal = additionalCosts
            .filter(c => (c.kind || '') === 'deduction')
            .reduce((s, c) => s + (c.amount || c.estimated_amount || c.actual_amount || 0), 0);
          const scope = project.total_value || 0;
          const grandTotal = scope + additionsTotal - deductionsTotal;
          // Use the backend-computed `total_income` (sum of APPROVED rows in
          // db.income — same source the Planning Board reads). Recomputing
          // from stage.amount_received + additional_costs.income_received
          // drifts whenever a stage was auto-healed or an addition recorded
          // a payment outside the income flow. Single source of truth.
          const totalIncome = projectData?.total_income ?? 0;
          const yetToReceive = Math.max(0, grandTotal - totalIncome);
          // Pending Dues = stages whose due date is already past and still
          // outstanding. Uses paymentStages which the client-side already has.
          const todayIso = new Date().toISOString().slice(0, 10);
          const pendingDues = (paymentStages || []).reduce((s, st) => {
            const bal = (st.amount || 0) - (st.amount_received || 0);
            if (bal <= 0.5) return s;
            const d = st.expected_payment_date || st.due_date;
            return d && d < todayIso ? s + bal : s;
          }, 0);
          const card = (label, value, color, testid, opts = {}) => (
            <div className={`rounded-lg border p-2.5 sm:p-3 transition-all hover:shadow-sm ${color}`} data-testid={testid}>
              <p className={`text-[10px] uppercase tracking-wide font-medium truncate ${opts.labelClass || 'text-gray-500'}`}>{label}</p>
              <p className={`text-sm sm:text-base lg:text-lg font-bold mt-1 ${opts.valueClass || 'text-gray-900'}`}>₹{(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
          );
          const SectionBox = ({ title, accent, children, testid, colSpan }) => (
            <div
              className={`rounded-xl border ${accent.border} ${accent.bg} p-3 sm:p-4 ${colSpan || ''}`}
              data-testid={testid}
            >
              <h3 className={`text-[11px] sm:text-xs font-semibold ${accent.text} uppercase tracking-wider mb-2.5`}>
                {title}
              </h3>
              {children}
            </div>
          );
          return (
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 mb-6 items-stretch" data-testid="client-project-summary">
              {/* Section 1 — Project Value Calculation (4 cards) */}
              <SectionBox
                title="Project Value Calculation"
                accent={{ border: 'border-blue-200', bg: 'bg-gradient-to-br from-blue-50/60 to-blue-50/20', text: 'text-blue-700' }}
                testid="client-section-project-value"
                colSpan="lg:col-span-4"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {card('Scope Value',  scope,          'bg-white border-blue-200 hover:border-blue-300',     'client-proj-scope',      { valueClass: 'text-blue-700' })}
                  {card('Additions',    additionsTotal, 'bg-white border-cyan-200 hover:border-cyan-300',     'client-proj-additions',  { valueClass: 'text-cyan-700' })}
                  {card('Deductions',   deductionsTotal,'bg-white border-orange-200 hover:border-orange-300', 'client-proj-deductions', { valueClass: 'text-orange-700' })}
                  {card('Grand Total',  grandTotal,     'bg-gradient-to-br from-violet-600 to-violet-700 border-violet-700 shadow-md hover:shadow-lg', 'client-proj-grandtotal', { labelClass: 'text-white/80', valueClass: 'text-white' })}
                </div>
              </SectionBox>

              {/* Section 2 — Financial Performance (2 cards) */}
              <SectionBox
                title="Financial Performance"
                accent={{ border: 'border-emerald-200', bg: 'bg-gradient-to-br from-emerald-50/60 to-emerald-50/20', text: 'text-emerald-700' }}
                testid="client-section-financial-performance"
                colSpan="lg:col-span-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  {card('Total Income',   totalIncome,  'bg-white border-emerald-200 hover:border-emerald-300', 'client-proj-income',      { valueClass: 'text-emerald-700' })}
                  {card('Yet to Receive', yetToReceive, 'bg-white border-orange-200 hover:border-orange-300',   'client-proj-receivable',  { valueClass: 'text-orange-700' })}
                </div>
              </SectionBox>
              {/* Pending Dues section removed from the top strip — it now lives
                  inside the Financial Summary card below, with the same
                  click-to-view-list behaviour. */}
            </div>
          );
        })()}

        {/* Summary Cards removed per client request — keep the top financial
            strip (Total Project Value / Total Income / Receivable / Pending Dues)
            and drop the duplicated 4 gradient tiles below it. */}

        {/* Construction Stage Progress */}
        {project.construction_stage && (
          <Card className="mb-8 print:break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-lg">Construction Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between overflow-x-auto pb-4">
                {CONSTRUCTION_STAGES.map((stage, index) => {
                  const isCompleted = index < currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  return (
                    <div key={stage.id} className="flex items-center">
                      <div className="flex flex-col items-center min-w-[80px]">
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center
                          ${isCompleted ? 'bg-green-500 text-white' : 
                            isCurrent ? 'bg-amber-500 text-white' : 
                            'bg-gray-200 text-gray-500'}
                        `}>
                          {isCompleted ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <span className="text-sm font-bold">{index + 1}</span>
                          )}
                        </div>
                        <span className={`text-xs mt-2 text-center ${isCurrent ? 'font-bold text-amber-600' : 'text-gray-500'}`}>
                          {stage.label}
                        </span>
                      </div>
                      {index < CONSTRUCTION_STAGES.length - 1 && (
                        <div className={`w-8 h-1 mx-1 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Card className="print:shadow-none print:border-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b print:hidden bg-gradient-to-r from-gray-50 via-white to-gray-50 py-3 sm:py-4 px-3 sm:px-4">
              <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4 scrollbar-thin">
                <TabsList className="bg-transparent p-0 h-auto w-max flex flex-nowrap gap-1 sm:gap-1.5 justify-start">
                  {[
                    { v: 'overview',       label: 'Overview',         Icon: LayoutDashboard, show: true,                                tid: 'cp-tab-overview' },
                    { v: 'final_estimate', label: 'Final Estimate',   Icon: FileCheck,       show: !!projectData?.final_estimate,       tid: 'cp-tab-final-estimate',
                      pendingDot: projectData?.final_estimate?.status === 'pending_client_review' },
                    { v: 'payments',       label: 'Payment Schedule', Icon: Calendar,        show: true,                                tid: 'cp-tab-payments' },
                    { v: 'additional',     label: 'Additional Work',  Icon: PlusCircle,      show: true,                                tid: 'cp-tab-additional' },
                    { v: 'deductions',     label: 'Deductions',       Icon: MinusCircle,     show: true,                                tid: 'cp-tab-deductions' },
                    { v: 'income',         label: 'Income Status',    Icon: Receipt,         show: true,                                tid: 'cp-tab-income' },
                    { v: 'scope',          label: 'Scope of Work',    Icon: ListChecks,      show: true,                                tid: 'cp-tab-scope' },
                    { v: 'photos',         label: 'Photos',           Icon: Image,           show: true,                                tid: 'cp-tab-photos' },
                    { v: 'documents',      label: 'Documents',        Icon: FileText,        show: true,                                tid: 'cp-tab-documents' },
                  ].filter(t => t.show).map(({ v, label, Icon, pendingDot, tid }) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      data-testid={tid}
                      className="
                        relative gap-1.5 px-2.5 lg:px-3 py-2
                        text-[11px] lg:text-xs font-medium whitespace-nowrap
                        rounded-lg border border-transparent
                        text-gray-600 bg-transparent
                        hover:bg-violet-50 hover:text-violet-700 hover:border-violet-100
                        data-[state=active]:bg-violet-600 data-[state=active]:text-white
                        data-[state=active]:border-violet-700 data-[state=active]:shadow-md
                        data-[state=active]:hover:bg-violet-700
                        transition-all
                      "
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{label}</span>
                      {pendingDot && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-pulse" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </CardHeader>

            {/* Overview Tab */}
            <TabsContent value="overview" className="p-4 sm:p-6 print:break-inside-avoid">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Project Details Card */}
                <div className="rounded-2xl border bg-gradient-to-br from-white to-blue-50/30 p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5 pb-4 border-b border-blue-100">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900">Project Details</h3>
                      <p className="text-xs text-gray-500">Site & timeline information</p>
                    </div>
                  </div>
                  <dl className="space-y-2">
                    {[
                      { label: 'Project Name', value: project.name || '—', Icon: Home, accent: { bg: 'bg-blue-100', text: 'text-blue-600' } },
                      { label: 'Client',       value: project.client_name || '—', Icon: User, accent: { bg: 'bg-indigo-100', text: 'text-indigo-600' } },
                      { label: 'Location',     value: project.location || '—', Icon: MapPin, accent: { bg: 'bg-rose-100', text: 'text-rose-600' } },
                      project.start_date && {
                        label: 'Start Date',
                        value: new Date(project.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        Icon: Calendar,
                        accent: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
                      },
                      project.expected_completion && {
                        label: 'Expected Completion',
                        value: new Date(project.expected_completion).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        Icon: CalendarCheck,
                        accent: { bg: 'bg-amber-100', text: 'text-amber-600' },
                      },
                    ].filter(Boolean).map(({ label, value, Icon, accent }) => (
                      <div
                        key={label}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50/80 transition-colors"
                      >
                        <div className={`w-9 h-9 rounded-lg ${accent.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`h-4 w-4 ${accent.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <dt className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</dt>
                          <dd className="text-sm font-semibold text-gray-900 truncate mt-0.5">{value}</dd>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 p-2.5 mt-2 rounded-lg bg-gradient-to-r from-violet-50/50 to-violet-50/20 border border-violet-100">
                      <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                        <AlertCircle className="h-4 w-4 text-violet-600" />
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Status</dt>
                        <dd>
                          {(() => {
                            const phaseKey = getProjectPhase(project);
                            const phase = PHASE_STYLES[phaseKey];
                            return (
                              <Badge
                                className={`font-semibold px-2.5 py-1 border ${phase.cls}`}
                                data-testid="client-details-phase-badge"
                              >
                                {phase.label}
                              </Badge>
                            );
                          })()}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>

                {/* Financial Summary Card */}
                <div className="rounded-2xl border bg-gradient-to-br from-white to-emerald-50/30 p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5 pb-4 border-b border-emerald-100">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <IndianRupee className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900">Financial Summary</h3>
                      <p className="text-xs text-gray-500">Payments at a glance</p>
                    </div>
                  </div>

                  {/* 4-tile mini KPI grid removed per client request — the
                      Total Project Value / Payment Scheduled / Received / Balance
                      Due numbers already live in the top financial strip above. */}

                  {/* Progress bar */}
                  <div className="rounded-xl bg-white border border-gray-200 px-3 py-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-700">Payment Progress</p>
                      <p className="text-sm font-bold text-gray-900">{progressPercent}%</p>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Pending Dues — click to open the overdue list dialog. */}
                  {(() => {
                    const todayIso = new Date().toISOString().slice(0, 10);
                    const overdueStages = (paymentStages || []).filter(st => {
                      const bal = (st.amount || 0) - (st.amount_received || 0);
                      if (bal <= 0.5) return false;
                      const d = st.expected_payment_date || st.due_date;
                      return d && d < todayIso;
                    });
                    const overdueAmt = overdueStages.reduce(
                      (s, st) => s + ((st.amount || 0) - (st.amount_received || 0)),
                      0
                    );
                    const overdueCount = overdueStages.length;
                    return (
                      <button
                        type="button"
                        onClick={() => setPendingDuesDialog({ open: true })}
                        className="w-full text-left flex items-center justify-between rounded-xl bg-white border border-red-200 hover:border-red-400 hover:shadow-md transition-all px-3 py-3 mb-3 group"
                        data-testid="financial-summary-pending-dues"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                            <Clock className="h-4 w-4 text-red-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              Pending Dues
                              <span className="text-red-500 group-hover:translate-x-0.5 transition-transform">→</span>
                            </p>
                            <p className="text-sm font-bold text-red-700 truncate">
                              ₹{(overdueAmt || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              {overdueCount > 0 && (
                                <span className="ml-1 text-[11px] font-normal text-gray-500">
                                  · {overdueCount} overdue
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <Badge className={`shrink-0 font-semibold ${overdueCount > 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                          {overdueCount > 0 ? `${overdueCount}` : 'All clear'}
                        </Badge>
                      </button>
                    );
                  })()}

                  {/* Milestones summary */}
                  <div className="flex items-center justify-between rounded-xl bg-white border border-gray-200 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Layers className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Payment Milestones</p>
                        <p className="text-sm font-bold text-gray-900">{paymentStages.length} stages</p>
                      </div>
                    </div>
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-semibold">{paymentStages.length}</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Final Estimate Tab — visible only AFTER GM approval */}
            {projectData?.final_estimate && (
              <TabsContent value="final_estimate" className="p-4 sm:p-6 print:break-inside-avoid" data-testid="cp-final-estimate-tab">
                <ClientFinalEstimateView
                  data={projectData}
                  onAction={async () => { await fetchProjectData(projectId); setActiveTab('final_estimate'); }}
                  projectId={projectId}
                />
              </TabsContent>
            )}

            {/* Payment Schedule Tab */}
            <TabsContent value="payments" className="p-0 print:break-inside-avoid">
              <div className="hidden print:block p-4 border-b">
                <h3 className="text-lg font-bold">Payment Schedule</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">%</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paymentStages.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                          Payment schedule not yet defined
                        </td>
                      </tr>
                    ) : (
                      paymentStages.map((stage, idx) => {
                        const stageBalance = (stage.amount || 0) - (stage.amount_received || 0);
                        // Same fix as ProjectDetail.jsx — 0-amount placeholder
                        // rows should not be flagged "Collected". They appear
                        // as Pending until a real amount is configured.
                        const isPaid = (stage.amount || 0) > 0 && stageBalance <= 0;
                        const isPartial = (stage.amount_received || 0) > 0 && stageBalance > 0;
                        
                        return (
                          <tr key={stage.stage_id} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''}`}>
                            <td className="px-4 py-3 text-sm">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{stage.stage_name}</p>
                              {stage.due_date && (
                                <p className="text-xs text-gray-500">Due: {new Date(stage.due_date).toLocaleDateString('en-IN')}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">{stage.percentage || 0}%</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{(stage.amount || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-green-600 font-semibold">₹{(stage.amount_received || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={stageBalance > 0 ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>
                                ₹{stageBalance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isPaid ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Paid</span>
                              ) : isPartial ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Partial</span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {paymentStages.length > 0 && (
                    <tfoot className="bg-amber-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{totalScheduled.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{totalReceived.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">₹{balance.toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* Additional Work Tab */}
            <TabsContent value="additional" className="p-0 print:break-inside-avoid">
              <div className="hidden print:block p-4 border-b">
                <h3 className="text-lg font-bold">Additional Work</h3>
              </div>
              {(() => {
                // Group additions by section (matches the Planning view layout).
                const sections = projectData.addition_sections || [];
                const ungrouped = additionalCosts.filter(c => !c.section_id);
                const isPendingForClient = (c) => c.client_approval_status === 'pending_client' || (c.payment_requested && !c.client_approved && !c.client_rejected && !((c.income_received || 0) >= (c.estimated_amount || 0)));
                const pendingAll = additionalCosts.filter(isPendingForClient);
                const handleApproveAll = async () => {
                  if (!pendingAll.length) return;
                  if (!window.confirm(`Approve all ${pendingAll.length} pending additions worth ₹${pendingAll.reduce((s,c)=>s+(c.estimated_amount||0),0).toLocaleString('en-IN')}?`)) return;
                  for (const c of pendingAll) {
                    const pre = c.client_approval_status === 'pending_client';
                    try {
                      if (pre) await axios.post(`${API}/additional-costs/${c.cost_id}/client-decision`, { decision: 'approve' });
                      else await axios.post(`${API}/client-portal/additional-costs/${c.cost_id}/approve`);
                    } catch { /* skip individual errors */ }
                  }
                  // Section-level approvals too
                  for (const s of sections.filter(x => x.client_approval_status === 'pending_client')) {
                    try { await axios.post(`${API}/projects/${projectId}/addition-sections/${s.section_id}/client-decision`, { decision: 'approve' }); } catch { /* skip */ }
                  }
                  toast.success('Approved all pending');
                  fetchProjectData(projectId);
                };

                // Render helper for a table of additions (shared by ungrouped + each section).
                const renderRows = (rows, startSerial = 1) => rows.map((cost, i) => {
                  const idx = startSerial + i - 1;
                  const amt = cost.estimated_amount || cost.actual_amount || 0;
                  const rcv = cost.income_received || 0;
                  const bal = amt - rcv;
                  const qty = cost.qty || 1;
                  const unit = cost.unit || '';
                  const unitRate = cost.price != null ? cost.price : (qty > 0 ? amt / qty : 0);
                  const isPaid = bal <= 0 && amt > 0;
                  const isPartial = rcv > 0 && bal > 0;
                  const requested = cost.payment_requested;
                  const clientApproved = cost.client_approved;
                  const clientRejected = cost.client_rejected;
                  const creApproved = cost.cre_approved;
                  const preStatus = cost.client_approval_status;
                  const reviewRequested = cost.client_review_requested;
                  const preIsPending = preStatus === 'pending_client';
                  const preIsApproved = preStatus === 'client_approved';
                  const preIsRejected = preStatus === 'client_rejected';
                  let statusBadge;
                  if (isPaid) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Paid</span>;
                  else if (isPartial) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Partial Received</span>;
                  else if (clientRejected || preIsRejected) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">Rejected</span>;
                  else if (reviewRequested) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-700" title={cost.client_review_note || ''}>Review Requested</span>;
                  else if (creApproved) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Approved · Pending Payment</span>;
                  else if (clientApproved || preIsApproved) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">You Approved</span>;
                  else if (requested) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Awaiting Your Approval</span>;
                  else if (preIsPending) statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">Awaiting Your Approval</span>;
                  else statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Pending</span>;
                  const showActions = ((requested && !clientApproved && !clientRejected && !isPaid) || preIsPending);
                  return (
                    <tr key={cost.cost_id} data-testid={`addn-row-${cost.cost_id}`}>
                      <td className="px-3 py-3 text-sm text-gray-700 align-top">{idx + 1}</td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-sm text-gray-900 font-medium break-words">{cost.name || cost.description}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 align-top whitespace-nowrap">{qty}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 align-top whitespace-nowrap">{unit || '—'}</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 align-top whitespace-nowrap">₹{unitRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900 align-top whitespace-nowrap">₹{amt.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 align-top truncate max-w-[160px]" title={cost.remarks || ''}>{cost.remarks || '—'}</td>
                      <td className="px-3 py-3 text-center align-top whitespace-nowrap">{statusBadge}</td>
                      <td className="px-3 py-3 text-center align-top print:hidden whitespace-nowrap">
                        {showActions ? (
                          <div className="flex items-center justify-center gap-1 flex-nowrap">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5" onClick={() => preIsPending ? handlePreApproveAddition(cost.cost_id) : handleClientApproveAddition(cost.cost_id)} data-testid={`client-approve-addn-${cost.cost_id}`}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50 h-8 px-2.5" onClick={() => preIsPending ? handlePreRejectAddition(cost) : handleClientRejectAddition(cost.cost_id)} data-testid={`client-reject-addn-${cost.cost_id}`}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                            <Button size="sm" variant="outline" className="border-sky-300 text-sky-700 hover:bg-sky-50 h-8 px-2.5" onClick={() => handleClientRequestReview(cost)} data-testid={`client-review-addn-${cost.cost_id}`}>
                              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Review
                            </Button>
                          </div>
                        ) : (<span className="text-xs text-gray-400">—</span>)}
                      </td>
                    </tr>
                  );
                });

                const headerRow = (
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">S.No</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Qty</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Unit</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Unit Rate</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Total</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Remarks</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Status</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase print:hidden whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                );

                return (
                  <>
                    {/* Master "Approve All Pending" — appears when there's anything to act on */}
                    {pendingAll.length > 0 && (
                      <div className="mx-4 mt-3 mb-2 p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100/40 border border-emerald-200 flex items-center justify-between gap-3 flex-wrap print:hidden" data-testid="client-approve-all-banner">
                        <div className="text-sm text-emerald-800">
                          <span className="font-bold">{pendingAll.length}</span> addition{pendingAll.length === 1 ? '' : 's'} awaiting your approval &middot; <span className="font-bold">₹{pendingAll.reduce((s,c)=>s+(c.estimated_amount||0),0).toLocaleString('en-IN')}</span>
                        </div>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={handleApproveAll} data-testid="client-approve-all-btn">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve All Pending
                        </Button>
                      </div>
                    )}

                    {/* Section blocks — each has its own header, attachments, table, and Approve Section button */}
                    {sections.map((s, sIdx) => {
                      const items = additionalCosts.filter(c => c.section_id === s.section_id);
                      if (items.length === 0) return null;
                      const subtotal = items.reduce((sum, c) => sum + (c.estimated_amount || 0), 0);
                      const recvSubtotal = items.reduce((sum, c) => sum + (c.income_received || 0), 0);
                      return (
                        <div key={s.section_id} className="mx-4 mt-4 rounded-xl border-2 border-violet-100 bg-violet-50/30 overflow-hidden" data-testid={`client-section-${s.section_id}`}>
                          <div className="flex items-center justify-between gap-3 flex-wrap p-3 bg-violet-50">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-violet-700">{s.title}</p>
                              <p className="text-[11px] text-gray-600 mt-0.5">
                                {items.length} addition{items.length === 1 ? '' : 's'} &middot; ₹{subtotal.toLocaleString('en-IN')}
                              </p>
                              {(s.attachments || []).length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {s.attachments.map(att => (
                                    <a key={att.file_id} href={`${API}/files/${att.file_id}/download`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-violet-200 text-[10px] text-violet-700">
                                      {att.filename}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                            {s.client_approval_status === 'pending_client' && (
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 print:hidden" onClick={() => handleSectionDecision(s.section_id, 'approve')} data-testid={`client-section-approve-${s.section_id}`}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve Section
                              </Button>
                            )}
                            {s.client_approval_status === 'client_approved' && (
                              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Section Approved</span>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              {headerRow}
                              <tbody className="bg-white divide-y divide-gray-200">
                                {renderRows(items, 1)}
                                <tr className="bg-gray-50/50">
                                  <td colSpan="5" className="px-3 py-2 text-right text-xs font-bold text-gray-600">Section Total</td>
                                  <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">₹{subtotal.toLocaleString('en-IN')}</td>
                                  <td colSpan="3" className="px-3 py-2 text-right text-[11px] text-gray-600">
                                    <span className="text-emerald-700">Received ₹{recvSubtotal.toLocaleString('en-IN')}</span>
                                    <span className="mx-1 text-gray-300">·</span>
                                    <span className="text-orange-600">Balance ₹{(subtotal-recvSubtotal).toLocaleString('en-IN')}</span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}

                    {/* Ungrouped (legacy) additions table */}
                    <div className="overflow-x-auto mt-4">
                      <table className="w-full">
                        {headerRow}
                        <tbody className="bg-white divide-y divide-gray-200">
                          {ungrouped.length === 0 ? (
                            <tr>
                              <td colSpan="9" className="px-6 py-8 text-center text-gray-500">{sections.length > 0 ? 'No ungrouped additions.' : 'No additional work recorded'}</td>
                            </tr>
                          ) : renderRows(ungrouped, 1)}
                        </tbody>
                        {additionalCosts.length > 0 && (
                          <tfoot className="bg-amber-50">
                            <tr>
                              <td colSpan="5" className="px-3 py-3 text-right text-sm font-bold text-gray-700">Total:</td>
                              <td className="px-3 py-3 text-right text-sm font-bold text-gray-900">₹{totalAdditional.toLocaleString('en-IN')}</td>
                              <td colSpan="3" className="px-3 py-3 text-right text-[11px] text-gray-600">
                                <span className="text-emerald-600">Received ₹{totalAdditionalReceived.toLocaleString('en-IN')}</span>
                                <span className="mx-1 text-gray-300">·</span>
                                <span className="text-orange-600">Balance ₹{(totalAdditional - totalAdditionalReceived).toLocaleString('en-IN')}</span>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </>
                );
              })()}
            </TabsContent>

            {/* Deductions Tab */}
            <TabsContent value="deductions" className="p-0 print:break-inside-avoid">
              <div className="hidden print:block p-4 border-b">
                <h3 className="text-lg font-bold">Deductions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase print:hidden">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No deductions applied</td>
                      </tr>
                    ) : (
                      deductions.map((ded, idx) => {
                        const isPending = ded.client_approval_status === 'pending_client';
                        const isApproved = ded.client_approval_status === 'client_approved';
                        const isRejected = ded.client_approval_status === 'client_rejected';
                        return (
                          <tr key={ded.deduction_id} className="hover:bg-gray-50" data-testid={`client-ded-row-${ded.deduction_id}`}>
                            <td className="px-4 py-3 text-sm">{idx + 1}</td>
                            <td className="px-4 py-3 font-medium">{ded.description || ded.name || 'Deduction'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{ded.remarks || '-'}</td>
                            <td className="px-4 py-3 text-right font-semibold text-rose-600">- ₹{(ded.amount || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-center print:hidden">
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                {isPending && (
                                  <>
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3" onClick={() => handleClientApproveDeduction(ded)} data-testid={`client-ded-approve-${ded.deduction_id}`}>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50 h-8 px-3" onClick={() => handleClientRejectDeduction(ded)} data-testid={`client-ded-reject-${ded.deduction_id}`}>
                                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                                    </Button>
                                  </>
                                )}
                                {isApproved && (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
                                  </span>
                                )}
                                {isRejected && (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700" title={ded.client_rejection_reason || ''}>
                                    <XCircle className="h-3 w-3 mr-1" /> Rejected
                                  </span>
                                )}
                                {!isPending && !isApproved && !isRejected && (
                                  <span className="text-[11px] text-gray-400 italic">Awaiting GM approval</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-rose-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">- ₹{totalDeductions.toLocaleString()}</td>
                        <td className="print:hidden"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* Income Status Tab — every recorded incoming payment, with status */}
            <TabsContent value="income" className="p-0 print:break-inside-avoid" data-testid="cp-income-tab">
              <div className="hidden print:block p-4 border-b">
                <h3 className="text-lg font-bold">Income Status</h3>
              </div>
              {(() => {
                const entries = projectData?.income_entries || [];
                if (entries.length === 0) {
                  return (
                    <div className="text-center py-16">
                      <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500 font-medium">No income recorded yet</p>
                      <p className="text-sm text-gray-400 mt-1">Payments you make will be listed here once recorded.</p>
                    </div>
                  );
                }
                const STATUS_STYLES = {
                  approved:           { label: 'Approved',         cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                  received:           { label: 'Received',         cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                  verified:           { label: 'Verified',         cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                  pending_approval:   { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
                  under_correction:   { label: 'Under Review',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
                  cheque_bounced:     { label: 'Cheque Bounced',   cls: 'bg-red-100 text-red-700 border-red-200' },
                  rejected:           { label: 'Rejected',         cls: 'bg-red-100 text-red-700 border-red-200' },
                  accountant_rejected:{ label: 'Rejected',         cls: 'bg-red-100 text-red-700 border-red-200' },
                };
                const APPROVED = new Set(['approved', 'received', 'verified']);
                const approvedSum = entries.reduce((s, e) => s + (APPROVED.has(e.status) ? (e.amount || 0) : 0), 0);
                const bouncedCheques = projectData?.bounced_cheques || [];
                const bouncedTotal = bouncedCheques.reduce((s, c) => s + (c.amount || 0), 0);
                return (
                  <Tabs defaultValue={bouncedCheques.length > 0 ? 'cheque_bounced' : 'amount'} className="w-full">
                    <div className="px-4 sm:px-6 pt-4 border-b bg-gradient-to-r from-emerald-50/40 to-white">
                      <TabsList className="bg-transparent p-0 h-auto gap-2 mb-3">
                        <TabsTrigger
                          value="amount"
                          data-testid="cp-income-subtab-amount"
                          className="
                            gap-2 px-4 py-2 text-xs sm:text-sm font-medium
                            rounded-lg border border-transparent
                            text-gray-600 bg-transparent
                            hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-100
                            data-[state=active]:bg-emerald-600 data-[state=active]:text-white
                            data-[state=active]:border-emerald-700 data-[state=active]:shadow-md
                            transition-all
                          "
                        >
                          <Receipt className="h-4 w-4" />
                          Amount
                          <Badge className="ml-1 bg-white/20 text-current border-0 text-[10px]">{entries.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger
                          value="cheque_bounced"
                          data-testid="cp-income-subtab-bounced"
                          className="
                            gap-2 px-4 py-2 text-xs sm:text-sm font-medium
                            rounded-lg border border-transparent
                            text-gray-600 bg-transparent
                            hover:bg-red-50 hover:text-red-700 hover:border-red-100
                            data-[state=active]:bg-red-600 data-[state=active]:text-white
                            data-[state=active]:border-red-700 data-[state=active]:shadow-md
                            transition-all
                          "
                        >
                          <AlertTriangle className="h-4 w-4" />
                          Cheque Bounced
                          <Badge className={`ml-1 border-0 text-[10px] ${bouncedCheques.length > 0 ? 'bg-red-100 text-red-700' : 'bg-white/20 text-current'}`}>{bouncedCheques.length}</Badge>
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    {/* Amount sub-tab — full income ledger */}
                    <TabsContent value="amount" className="m-0">
                      <div className="px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-emerald-50/40 to-white flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Total Approved Income</p>
                          <p className="text-2xl font-bold text-emerald-700 mt-0.5">₹{approvedSum.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Entries</p>
                          <p className="text-2xl font-bold text-gray-900 mt-0.5">{entries.length}</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto" data-testid="cp-income-table-all">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden sm:table-cell">Mode</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entries.map((inc, idx) => {
                              const st = STATUS_STYLES[inc.status] || { label: (inc.status || 'Unknown').replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-700 border-gray-200' };
                              const d = inc.payment_date ? new Date(inc.payment_date) : null;
                              const isBounce = inc.status === 'cheque_bounced';
                              return (
                                <tr
                                  key={inc.income_id || idx}
                                  className={`hover:bg-gray-50/60 ${isBounce ? 'bg-red-50/30' : ''}`}
                                  data-testid={`cp-income-row-${inc.income_id || idx}`}
                                >
                                  <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                                    {d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 min-w-[200px]">
                                    <p className="truncate max-w-[360px]">{inc.description || inc.category || 'Payment'}</p>
                                    {inc.reference && (
                                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">Ref: {inc.reference}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                    <Badge className={`text-[10px] font-medium border ${inc.is_additional ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                      {inc.is_additional ? 'Direct Transfer' : 'Main Income'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell capitalize">{(inc.payment_mode || '—').replace(/_/g, ' ')}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">₹{(inc.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                  <td className="px-4 py-3 text-center">
                                    <Badge className={`text-xs font-medium border ${st.cls}`}>{st.label}</Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>

                    {/* Cheque Bounced sub-tab — pulled from Cheque Management */}
                    <TabsContent value="cheque_bounced" className="m-0">
                      {bouncedCheques.length === 0 ? (
                        <div className="text-center py-16">
                          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
                          <p className="text-emerald-700 font-semibold">No bounced cheques</p>
                          <p className="text-sm text-gray-500 mt-1">All cheque payments have cleared successfully.</p>
                        </div>
                      ) : (
                        <>
                          <div className="px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-red-50/60 to-red-100/30 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-red-200 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-5 w-5 text-red-700" />
                              </div>
                              <div>
                                <p className="text-xs text-red-700 font-semibold uppercase tracking-wide">Total Bounced</p>
                                <p className="text-2xl font-bold text-red-700 mt-0.5">₹{bouncedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Cheques</p>
                              <p className="text-2xl font-bold text-gray-900 mt-0.5">{bouncedCheques.length}</p>
                            </div>
                          </div>
                          <div className="px-4 sm:px-6 py-3 bg-red-50/40 border-b border-red-100 text-xs sm:text-sm text-red-700">
                            Please arrange an alternate payment for the bounced cheques listed below.
                          </div>
                          <div className="overflow-x-auto" data-testid="cp-bounced-table">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cheque No</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Bank</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Cheque Date</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Bounced On</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {bouncedCheques.map((ch, idx) => {
                                  const cd = ch.cheque_date ? new Date(ch.cheque_date) : null;
                                  const bd = ch.bounced_at ? new Date(ch.bounced_at) : null;
                                  return (
                                    <tr
                                      key={ch.cheque_id || idx}
                                      className="hover:bg-red-50/30"
                                      data-testid={`cp-bounced-row-${ch.cheque_id || idx}`}
                                    >
                                      <td className="px-4 py-3 font-semibold text-red-900 whitespace-nowrap">#{ch.cheque_number || '—'}</td>
                                      <td className="px-4 py-3 text-gray-700">{ch.bank_name || '—'}</td>
                                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap hidden md:table-cell">
                                        {cd ? cd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                      </td>
                                      <td className="px-4 py-3 text-red-700 whitespace-nowrap font-medium">
                                        {bd ? bd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                      </td>
                                      <td className="px-4 py-3 text-gray-700 max-w-[260px] truncate" title={ch.bounce_reason}>{ch.bounce_reason}</td>
                                      <td className="px-4 py-3 text-right font-bold text-red-700 whitespace-nowrap">
                                        ₹{(ch.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        {ch.bounce_charges > 0 && (
                                          <div className="text-[10px] font-normal text-red-500 mt-0.5">+ ₹{ch.bounce_charges.toLocaleString('en-IN')} charges</div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                );
              })()}
            </TabsContent>

            {/* Scope of Work Tab */}
            <TabsContent value="scope" className="p-0 print:break-inside-avoid">
              <div className="hidden print:block p-4 border-b">
                <h3 className="text-lg font-bold">Scope of Work</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {scopeItems.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                          Scope items not yet defined
                        </td>
                      </tr>
                    ) : (
                      scopeItems.map((item, idx) => (
                        <tr key={item.scope_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium">{item.item_name}</td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3">{item.unit}</td>
                          <td className="px-4 py-3 text-right">₹{(item.unit_rate || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-semibold">₹{(item.total_amount || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {scopeItems.length > 0 && (
                    <tfoot className="bg-amber-50 border-t-2">
                      <tr>
                        <td colSpan="5" className="px-4 py-3 text-right font-bold">Total Scope Value:</td>
                        <td className="px-4 py-3 text-right font-bold">
                          ₹{scopeItems.reduce((sum, item) => sum + (item.total_amount || 0), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* Photos Tab */}
            <TabsContent value="photos" className="p-6 print:hidden">
              {photos.length === 0 ? (
                <div className="text-center py-12">
                  <Image className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No photos uploaded yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {photos.map((photo) => (
                    <div key={photo.photo_id} className="rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={`${API}/files/${photo.file_id}`}
                        alt={photo.caption || 'Site photo'}
                        className="w-full h-40 object-cover"
                      />
                      {photo.caption && (
                        <p className="p-2 text-sm text-gray-600">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="p-6 print:hidden">
              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No documents uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-3" data-testid="client-documents-list">
                  {documents.map((doc) => {
                    const sizeKb = doc.size ? `${Math.round(doc.size / 1024).toLocaleString()} KB` : null;
                    // db.files-backed rows expose a `source: 'files'` flag and use the
                    // /files/{id}/download endpoint; legacy db.documents rows use /files/{id}.
                    const href = doc.source === 'files'
                      ? `${API}/files/${doc.file_id}/download`
                      : `${API}/files/${doc.file_id}`;
                    return (
                      <div
                        key={doc.document_id || doc.file_id}
                        className="flex items-center justify-between p-4 bg-white border rounded-xl hover:shadow-md transition-shadow"
                        data-testid={`client-doc-${doc.document_id || doc.file_id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{doc.title}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                              <span className="capitalize">{(doc.category || '').replace(/-/g, ' ')}</span>
                              {sizeKb && <span>{sizeKb}</span>}
                              {doc.uploaded_by_name && <span>by {doc.uploaded_by_name}</span>}
                              {doc.created_at && (
                                <span>{new Date(doc.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
                            data-testid={`client-doc-view-${doc.document_id || doc.file_id}`}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                            onClick={async (e) => {
                              e.preventDefault();
                              try {
                                const res = await fetch(href, { credentials: 'include' });
                                if (!res.ok) throw new Error('Download failed');
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = doc.title || 'document';
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                              } catch {
                                window.open(href, '_blank');
                              }
                            }}
                            data-testid={`client-doc-download-${doc.document_id || doc.file_id}`}
                          >
                            Download
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Print Footer */}
        <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-gray-500">
          <p>Generated from My Home USB Client Portal • {new Date().toLocaleDateString('en-IN')}</p>
        </div>
      </div>
      <MobileBottomNav user={user} />

      {/* Pending Dues drill-down dialog — opens from the top "Pending Dues" tile */}
      <Dialog open={pendingDuesDialog.open} onOpenChange={(o) => setPendingDuesDialog({ open: o })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-600" /> Pending Dues
            </DialogTitle>
            <DialogDescription>
              Payment stages whose expected payment date has passed and still carry an outstanding balance.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const todayIso = new Date().toISOString().slice(0, 10);
            const overdue = (paymentStages || []).filter(st => {
              const bal = (st.amount || 0) - (st.amount_received || 0);
              if (bal <= 0.5) return false;
              const d = st.expected_payment_date || st.due_date;
              return d && d < todayIso;
            }).sort((a, b) => {
              const da = a.expected_payment_date || a.due_date || '';
              const db = b.expected_payment_date || b.due_date || '';
              return da.localeCompare(db);
            });
            const totalOverdue = overdue.reduce((s, st) => s + ((st.amount || 0) - (st.amount_received || 0)), 0);
            if (overdue.length === 0) {
              return (
                <div className="py-10 text-center" data-testid="pending-dues-empty">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                  <p className="font-semibold text-emerald-700">No overdue payments</p>
                  <p className="text-sm text-gray-500 mt-1">All payment milestones are up to date.</p>
                </div>
              );
            }
            return (
              <div className="max-h-[60vh] overflow-y-auto pr-1" data-testid="pending-dues-list">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs text-gray-500 font-medium">{overdue.length} overdue stage{overdue.length > 1 ? 's' : ''}</span>
                  <span className="text-sm font-bold text-red-700">Total: ₹{totalOverdue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="space-y-2">
                  {overdue.map((st) => {
                    const bal = (st.amount || 0) - (st.amount_received || 0);
                    const expDate = st.expected_payment_date || st.due_date;
                    const daysOverdue = expDate ? Math.floor((new Date(todayIso) - new Date(expDate)) / 86400000) : 0;
                    return (
                      <div
                        key={st.stage_id}
                        className="rounded-lg border border-red-200 bg-red-50/40 p-3 flex items-start justify-between gap-3"
                        data-testid={`pending-dues-row-${st.stage_id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{st.stage_name || st.stage_label || 'Payment Stage'}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-600">
                            {expDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due {new Date(expDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                            {daysOverdue > 0 && (
                              <span className="text-red-700 font-medium">{daysOverdue} day{daysOverdue > 1 ? 's' : ''} overdue</span>
                            )}
                            <span>Scheduled: ₹{(st.amount || 0).toLocaleString('en-IN')}</span>
                            {(st.amount_received || 0) > 0 && (
                              <span className="text-emerald-700">Paid: ₹{(st.amount_received || 0).toLocaleString('en-IN')}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] uppercase tracking-wide text-red-500 font-semibold">Balance</p>
                          <p className="text-base font-bold text-red-700">₹{bal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setPendingDuesDialog({ open: false }); setActiveTab('payments'); }}
              data-testid="pending-dues-view-schedule"
            >
              View Full Schedule
            </Button>
            <Button
              onClick={() => setPendingDuesDialog({ open: false })}
              data-testid="pending-dues-close"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject / Review decision dialog — replaces native window.prompt */}
      <Dialog open={decisionDialog.open} onOpenChange={(o) => !decisionDialog.submitting && setDecisionDialog(d => ({ ...d, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {decisionDialog.mode === 'reject' ? (
                <><XCircle className="h-5 w-5 text-rose-600" /> Reject {decisionDialog.kind === 'deduction' ? 'Deduction' : 'Additional Work'}</>
              ) : (
                <><MessageSquare className="h-5 w-5 text-sky-600" /> Request a Review</>
              )}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.mode === 'reject' ? (
                <>Tell Planning why you're rejecting <span className="font-semibold text-gray-800">"{decisionDialog.name}"</span>. They will see your reason and can resend after addressing it.</>
              ) : (
                <>Tell Planning what you'd like to clarify about <span className="font-semibold text-gray-800">"{decisionDialog.name}"</span> before approving. They will be notified.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="decision-note" className="text-sm font-medium">
              {decisionDialog.mode === 'reject' ? 'Reason' : 'Note for Planning'}
              <span className="text-rose-500 ml-0.5">*</span>
            </Label>
            <Textarea
              id="decision-note"
              data-testid="decision-dialog-input"
              autoFocus
              rows={4}
              placeholder={decisionDialog.mode === 'reject'
                ? 'e.g., This was already covered in the original scope...'
                : 'e.g., Can you confirm what material this covers?'}
              value={decisionDialog.text}
              onChange={(e) => setDecisionDialog(d => ({ ...d, text: e.target.value }))}
              className="resize-none"
            />
            <p className="text-[11px] text-gray-500">
              {(decisionDialog.text || '').length} characters
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionDialog({ open: false, mode: null, kind: 'addition', costId: null, name: '', text: '', submitting: false })}
              disabled={decisionDialog.submitting}
              data-testid="decision-dialog-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={submitDecisionDialog}
              disabled={decisionDialog.submitting || !decisionDialog.text.trim()}
              className={decisionDialog.mode === 'reject'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-sky-600 hover:bg-sky-700 text-white'}
              data-testid="decision-dialog-submit"
            >
              {decisionDialog.submitting
                ? 'Sending…'
                : decisionDialog.mode === 'reject' ? 'Submit Rejection' : 'Send Review Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Client Final Estimate View ──────────────────────────────────────────────
// Surfaces the GM-approved Final Estimate to the client with Approve / Reject CTAs.
// Talks to /client-portal/final-estimate/{id}/approve and /reject.
function ClientFinalEstimateView({ data, onAction, projectId }) {
  const fe = data?.final_estimate || {};
  const scope = data?.scope_items || [];
  const total = scope.reduce((s, item) => s + (item.total_amount || 0), 0);
  const [decision, setDecision] = useState({ open: false, mode: null, reason: '', submitting: false });

  const submit = async () => {
    setDecision(d => ({ ...d, submitting: true }));
    try {
      const url = decision.mode === 'approve'
        ? `${API}/client-portal/final-estimate/${projectId}/approve`
        : `${API}/client-portal/final-estimate/${projectId}/reject`;
      const body = decision.mode === 'reject' ? { reason: decision.reason.trim() } : {};
      await axios.post(url, body);
      toast.success(decision.mode === 'approve' ? 'Final Estimate approved — thank you!' : 'Sent back to our team for revision');
      setDecision({ open: false, mode: null, reason: '', submitting: false });
      onAction();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed. Please try again.');
      setDecision(d => ({ ...d, submitting: false }));
    }
  };

  const isPendingClient = fe.status === 'pending_client_review' || fe.status === 'feedback_received';
  const isPreparing = !fe.status || fe.status === 'not_started' || fe.status === 'draft' || fe.status === 'pending_planning_review' || fe.status === 'pending_planning_head' || fe.status === 'pending_gm';
  const statusLabel = fe.status === 'approved' ? 'Approved by You'
    : fe.status === 'feedback_received' ? 'Awaiting Revised Estimate'
    : fe.status === 'pending_client_review' ? 'Awaiting Your Decision'
    : isPreparing ? 'Being Prepared'
    : fe.status;
  const statusTone = fe.status === 'approved'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : fe.status === 'feedback_received'
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : isPreparing
    ? 'bg-slate-50 text-slate-600 border-slate-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/30 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" /> Final Estimate
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isPreparing
                ? 'Our team is preparing your Final Estimate'
                : <>GM-approved on {fe.gm_approved_at ? new Date(fe.gm_approved_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'} · Revision {fe.revision ?? 0}</>
              }
            </p>
          </div>
          <Badge variant="outline" className={`text-xs px-2.5 py-1 ${statusTone}`} data-testid="cp-fe-status-badge">{statusLabel}</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <div className="bg-white rounded-lg border p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Estimated Total</p>
            <p className="text-base sm:text-lg font-bold text-blue-700">₹{(total || 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Scope Items</p>
            <p className="text-base sm:text-lg font-bold text-gray-900">{scope.length}</p>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Shared With You</p>
            <p className="text-xs sm:text-sm font-medium text-gray-700">
              {fe.sent_to_client_at ? new Date(fe.sent_to_client_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Approval-state messages */}
      {isPreparing && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3" data-testid="cp-fe-preparing-banner">
          <FileText className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Your Final Estimate is being prepared</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Our planning team is putting together the detailed final estimate for your project. You'll be notified here as soon as it's ready for your review and approval.
            </p>
          </div>
        </div>
      )}

      {fe.status === 'approved' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3" data-testid="cp-fe-approved-banner">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">You approved this Final Estimate</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {fe.client_approved_at ? `Approved on ${new Date(fe.client_approved_at).toLocaleString('en-IN')}` : ''} — your construction can now move forward.
            </p>
          </div>
        </div>
      )}

      {fe.status === 'feedback_received' && (fe.client_rejection_reason || (fe.client_feedback && fe.client_feedback.length > 0)) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4" data-testid="cp-fe-feedback-banner">
          <p className="text-sm font-semibold text-rose-800 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> You requested a revision
          </p>
          <p className="text-xs text-rose-700 mt-1 italic">
            "{fe.client_rejection_reason || (fe.client_feedback?.[fe.client_feedback.length - 1]?.reason)}"
          </p>
          <p className="text-[11px] text-rose-600 mt-1">Our team will share an updated estimate soon. You can also approve the current version if you've changed your mind.</p>
        </div>
      )}

      {/* Scope items list */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">Scope of Work</h3>
        </div>
        {scope.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">No scope items yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50/50 text-[11px] text-gray-600 uppercase">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Unit Rate</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scope.map((item, idx) => (
                  <tr key={item.scope_id || idx}>
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{item.item_name}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{item.quantity ?? '—'} {item.unit || ''}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{item.unit_rate ? `₹${item.unit_rate.toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">₹{(item.total_amount || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right font-semibold">Estimated Total</td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-700">₹{(total || 0).toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Approve / Reject actions */}
      {isPendingClient && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4 sm:p-5" data-testid="cp-fe-actions">
          <h4 className="text-sm font-semibold text-blue-900 mb-1">Your Decision</h4>
          <p className="text-xs text-blue-700 mb-3">Approve to confirm the estimate or request a revision with your feedback.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={() => setDecision({ open: true, mode: 'approve', reason: '', submitting: false })}
              data-testid="cp-fe-approve-btn"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve Final Estimate
            </Button>
            <Button
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-2"
              onClick={() => setDecision({ open: true, mode: 'reject', reason: '', submitting: false })}
              data-testid="cp-fe-reject-btn"
            >
              <XCircle className="h-4 w-4" /> Reject & Request Revision
            </Button>
          </div>
        </div>
      )}

      {/* Decision dialog */}
      <Dialog open={decision.open} onOpenChange={(o) => !o && !decision.submitting && setDecision({ open: false, mode: null, reason: '', submitting: false })}>
        <DialogContent className="max-w-md" data-testid="cp-fe-decision-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {decision.mode === 'approve' ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Confirm Approval</>
              ) : (
                <><XCircle className="h-5 w-5 text-rose-600" /> Request Revision</>
              )}
            </DialogTitle>
            <DialogDescription>
              {decision.mode === 'approve'
                ? 'Once you approve, our team will move your project to the next phase. This action cannot be undone from the portal.'
                : 'Tell us what you would like to change. Our team will revise the Final Estimate and resend it to you.'}
            </DialogDescription>
          </DialogHeader>
          {decision.mode === 'reject' && (
            <Textarea
              autoFocus
              rows={4}
              value={decision.reason}
              onChange={(e) => setDecision(d => ({ ...d, reason: e.target.value }))}
              placeholder="What needs to change? Be as specific as possible."
              disabled={decision.submitting}
              data-testid="cp-fe-reason-input"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision({ open: false, mode: null, reason: '', submitting: false })} disabled={decision.submitting}>Cancel</Button>
            <Button
              className={decision.mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}
              onClick={submit}
              disabled={decision.submitting || (decision.mode === 'reject' && !decision.reason.trim())}
              data-testid="cp-fe-decision-confirm"
            >
              {decision.submitting ? 'Submitting…' : (decision.mode === 'approve' ? 'Yes, Approve' : 'Send to Team')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
