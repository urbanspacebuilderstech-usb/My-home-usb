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
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
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
  const handlePreRejectAddition = async (costId) => {
    const reason = window.prompt('Please share a brief reason for rejecting:', '');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Reason is required to reject'); return; }
    try {
      await axios.post(`${API}/additional-costs/${costId}/client-decision`, { decision: 'reject', reason });
      toast.success('Rejection recorded');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to reject');
    }
  };
  // Client asks Planning for a review/clarification before approving.
  // Records a note that Planning sees in their notification feed.
  const handleClientRequestReview = async (costId) => {
    const note = window.prompt('What would you like to clarify with Planning before approving?', '');
    if (note === null) return;
    if (!note.trim()) { toast.error('Please share a short note so Planning knows what to clarify'); return; }
    try {
      await axios.post(`${API}/client-portal/additional-costs/${costId}/request-review`, { note });
      toast.success('Review request sent to Planning');
      if (projectId) fetchProjectData(projectId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send review request');
    }
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
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
              {project.status}
            </Badge>
            {project.construction_stage && (
              <Badge className="bg-amber-50 text-amber-700">
                Stage: {CONSTRUCTION_STAGES.find(s => s.id === project.construction_stage)?.label || project.construction_stage}
              </Badge>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:break-inside-avoid">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Project Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700">₹{((project.total_value || 0) / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Amount Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">₹{(totalReceived / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <IndianRupee className="h-4 w-4" /> Balance Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">₹{(balance / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>

          <Card
            className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setActiveTab('payments')}
            data-testid="pending-dues-card"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pending Dues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-purple-700">{pendingDueCount}</div>
                <div className="text-xs text-purple-600">/ {paymentStages.length} stages</div>
              </div>
              <div className="text-xs text-gray-500 mt-1.5 truncate">
                {pendingDueCount > 0 ? (
                  <>
                    <span className="font-semibold text-purple-700">₹{(balance / 100000).toFixed(2)}L</span> remaining
                    {nearestDueDate && (
                      <span className="ml-1 text-purple-600">· next due {nearestDueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    )}
                  </>
                ) : (
                  <span className="text-emerald-700 font-medium">All payments cleared</span>
                )}
              </div>
              <div className="text-[10px] text-purple-500 mt-1.5 font-medium hover:text-purple-700">View schedule →</div>
            </CardContent>
          </Card>
        </div>

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
            <CardHeader className="border-b print:hidden">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="payments">Payment Schedule</TabsTrigger>
                <TabsTrigger value="additional">Additional Work</TabsTrigger>
                <TabsTrigger value="deductions">Deductions</TabsTrigger>
                <TabsTrigger value="scope">Scope of Work</TabsTrigger>
                <TabsTrigger value="photos">Photos</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
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
                  <dl className="space-y-3.5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <Home className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Project Name</dt>
                        <dd className="text-sm font-semibold text-gray-900 truncate">{project.name || '—'}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Client</dt>
                        <dd className="text-sm font-semibold text-gray-900 truncate">{project.client_name || '—'}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <MapPin className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Location</dt>
                        <dd className="text-sm font-semibold text-gray-900 truncate">{project.location || '—'}</dd>
                      </div>
                    </div>
                    {project.start_date && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                          <Calendar className="h-3.5 w-3.5 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Start Date</dt>
                          <dd className="text-sm font-semibold text-gray-900">{new Date(project.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</dd>
                        </div>
                      </div>
                    )}
                    {project.expected_completion && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                          <CalendarCheck className="h-3.5 w-3.5 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Expected Completion</dt>
                          <dd className="text-sm font-semibold text-gray-900">{new Date(project.expected_completion).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</dd>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <AlertCircle className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-2">
                        <dt className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Status</dt>
                        <dd>
                          <Badge className={`capitalize font-medium ${
                            project.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            project.status === 'completed' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            project.status === 'in_planning' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            {(project.status || 'unknown').replace(/_/g, ' ')}
                          </Badge>
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

                  {/* Mini KPI tiles */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold mb-0.5">Total Project Value</p>
                      <p className="text-base sm:text-lg font-bold text-blue-900">₹{((project.total_value || 0) / 100000).toFixed(2)}L</p>
                      <p className="text-[10px] text-blue-500 mt-0.5">₹{(project.total_value || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wide text-violet-600 font-semibold mb-0.5">Payment Scheduled</p>
                      <p className="text-base sm:text-lg font-bold text-violet-900">₹{(totalScheduled / 100000).toFixed(2)}L</p>
                      <p className="text-[10px] text-violet-500 mt-0.5">₹{totalScheduled.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3">
                      <div className="flex items-center gap-1 mb-0.5">
                        <TrendingUp className="h-3 w-3 text-emerald-600" />
                        <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">Received</p>
                      </div>
                      <p className="text-base sm:text-lg font-bold text-emerald-700">₹{(totalReceived / 100000).toFixed(2)}L</p>
                      <p className="text-[10px] text-emerald-500 mt-0.5">₹{totalReceived.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-orange-50 border border-orange-100 px-3 py-3">
                      <div className="flex items-center gap-1 mb-0.5">
                        <TrendingDown className="h-3 w-3 text-orange-600" />
                        <p className="text-[10px] uppercase tracking-wide text-orange-600 font-semibold">Balance Due</p>
                      </div>
                      <p className="text-base sm:text-lg font-bold text-orange-700">₹{(balance / 100000).toFixed(2)}L</p>
                      <p className="text-[10px] text-orange-500 mt-0.5">₹{balance.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

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
                        const isPaid = stageBalance <= 0;
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
                        <p className="text-sm text-gray-900 font-medium">{cost.name || cost.description}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 align-top">{qty}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 align-top">{unit || '—'}</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 align-top">₹{unitRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900 align-top">₹{amt.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 align-top truncate max-w-[160px]" title={cost.remarks || ''}>{cost.remarks || '—'}</td>
                      <td className="px-3 py-3 text-center align-top">{statusBadge}</td>
                      <td className="px-3 py-3 text-center align-top print:hidden">
                        {showActions ? (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8" onClick={() => preIsPending ? handlePreApproveAddition(cost.cost_id) : handleClientApproveAddition(cost.cost_id)} data-testid={`client-approve-addn-${cost.cost_id}`}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50 h-8" onClick={() => preIsPending ? handlePreRejectAddition(cost.cost_id) : handleClientRejectAddition(cost.cost_id)} data-testid={`client-reject-addn-${cost.cost_id}`}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                            <Button size="sm" variant="outline" className="border-sky-300 text-sky-700 hover:bg-sky-50 h-8" onClick={() => handleClientRequestReview(cost.cost_id)} data-testid={`client-review-addn-${cost.cost_id}`}>
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
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase print:hidden">Action</th>
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
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">No deductions applied</td>
                      </tr>
                    ) : (
                      deductions.map((ded, idx) => (
                        <tr key={ded.deduction_id} className="hover:bg-gray-50" data-testid={`client-ded-row-${ded.deduction_id}`}>
                          <td className="px-4 py-3 text-sm">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium">{ded.description || ded.name || 'Deduction'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{ded.remarks || '-'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-rose-600">- ₹{(ded.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-rose-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">- ₹{totalDeductions.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.document_id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-amber-600" />
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <p className="text-sm text-gray-500">{doc.category}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`${API}/files/${doc.file_id}`, '_blank')}
                      >
                        Download
                      </Button>
                    </div>
                  ))}
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
    </div>
  );
}
