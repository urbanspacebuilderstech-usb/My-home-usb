import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import LabourAdvanceQueue from '../components/LabourAdvanceQueue';
import RABApprovalQueue from '../components/RABApprovalQueue';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Building2, Eye, Users, ArrowRight, Check, X, Plus, Search,
  Trash2, Edit, ClipboardList, UserPlus, HardHat, Package, MapPin
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { PMMaterialReadOnlyList, PMLabourReadOnlyList } from '../components/PMReadOnlyLifecycle';
import PMPettyCashTabs from '../components/PMPettyCashTabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PMDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all_projects');

  // Projects
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [stages, setStages] = useState([]);
  const [stageDialog, setStageDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newStage, setNewStage] = useState('');

  // Team Assignment
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignProject, setAssignProject] = useState(null);
  const [selectedSrSE, setSelectedSrSE] = useState('');
  const [selectedSE, setSelectedSE] = useState('');

  // Requests
  const [materialRequests, setMaterialRequests] = useState([]);
  const [labourRequests, setLabourRequests] = useState([]);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Team
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [createSEDialog, setCreateSEDialog] = useState(false);
  const [seForm, setSEForm] = useState({ name: '', phone: '', email: '', role: 'site_engineer' });

  // Petty Cash
  const [pettyCashRequests, setPettyCashRequests] = useState([]);
  const [pcRejectDialog, setPcRejectDialog] = useState(false);
  const [pcRejectTarget, setPcRejectTarget] = useState(null);
  const [pcRejectReason, setPcRejectReason] = useState('');

  // DLR & DPR
  const [dlrDprSubTab, setDlrDprSubTab] = useState('dlr');
  const [dlrDprStartDate, setDlrDprStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dlrDprEndDate, setDlrDprEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [dlrDprRows, setDlrDprRows] = useState([]);
  const [dlrDprLoading, setDlrDprLoading] = useState(false);
  const [dlrDprProjectSearch, setDlrDprProjectSearch] = useState('');
  const [invSummaryStartDate, setInvSummaryStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [invSummaryEndDate, setInvSummaryEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [invSummaryRows, setInvSummaryRows] = useState([]);
  const [invSummaryLoading, setInvSummaryLoading] = useState(false);
  const [invProjectSearch, setInvProjectSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['project_manager', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);

      const [projRes, matReqRes, labReqRes, rabReqRes, teamRes, stagesRes, pcRes] = await Promise.allSettled([
        axios.get(`${API}/pm/projects`),
        axios.get(`${API}/pm/material-requests`),
        axios.get(`${API}/pm/labour-requests`),
        // RAB stage payment requests (project_work_orders.stages[].payment_requests[]).
        // Same dashboard bucket as legacy labour_expenses — fetched separately
        // because the two collections have different shapes. The merge below
        // gives PM a unified "Work Order / Labour (RAB)" view.
        axios.get(`${API}/pm/labour-stage-requests`, { params: { status: 'all' } }),
        axios.get(`${API}/pm/team-members`),
        axios.get(`${API}/pm/project-stages`),
        axios.get(`${API}/pm/petty-cash-requests`)
      ]);

      if (projRes.status === 'fulfilled') setProjects(projRes.value.data || []);
      if (matReqRes.status === 'fulfilled') setMaterialRequests(matReqRes.value.data || []);
      // Merge legacy labour_expenses + new RAB stage payment_requests so PM
      // sees every pending labour/work-order request in one list. Multi-stage
      // RAB siblings (same `rab_group_id`) are collapsed into ONE row so the
      // PM Board mirrors the SE Total RAB's view (RAB-01 with 2 stages, not
      // RAB-01 + RAB-02). Approval cascade still hits every sibling on submit.
      const legacyLab = labReqRes.status === 'fulfilled' ? (labReqRes.value.data || []) : [];
      const rabLab = rabReqRes.status === 'fulfilled' ? ((rabReqRes.value.data || {}).requests || []) : [];
      const collapsedRabLab = (() => {
        const groups = new Map();   // group_id -> aggregated row
        const order = [];           // preserves first-seen order
        for (const r of rabLab) {
          const gid = r.rab_group_id || r.request_id;
          if (!groups.has(gid)) {
            order.push(gid);
            groups.set(gid, {
              ...r,
              is_multi_stage: false,
              stage_breakdown: [{
                stage_id: r.stage_id,
                stage_name: r.stage_name,
                request_id: r.request_id,
                amount: r.amount,
              }],
            });
          } else {
            const g = groups.get(gid);
            g.amount = (g.amount || 0) + (r.amount || 0);
            g.stage_breakdown.push({
              stage_id: r.stage_id,
              stage_name: r.stage_name,
              request_id: r.request_id,
              amount: r.amount,
            });
            g.is_multi_stage = g.stage_breakdown.length > 1;
            // Combined stage label
            g.stage_name = g.stage_breakdown.map(s => s.stage_name).join(' + ');
          }
        }
        return order.map(k => groups.get(k));
      })();
      setLabourRequests([...legacyLab, ...collapsedRabLab]);
      if (teamRes.status === 'fulfilled') setTeamMembers(teamRes.value.data || []);
      if (stagesRes.status === 'fulfilled') setStages(stagesRes.value.data || []);
      if (pcRes.status === 'fulfilled') setPettyCashRequests(pcRes.value.data || []);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 15000);

  // === DLR & DPR ===
  const fetchDlrDprSummary = async () => {
    setDlrDprLoading(true);
    try {
      const res = await axios.get(`${API}/pm/dlr-dpr-summary`, { params: { start_date: dlrDprStartDate, end_date: dlrDprEndDate } });
      setDlrDprRows(res.data?.rows || []);
    } catch {
      setDlrDprRows([]);
      toast.error('Failed to load DLR & DPR summary');
    } finally {
      setDlrDprLoading(false);
    }
  };
  useEffect(() => {
    if (activeTab === 'dlrdpr' && dlrDprSubTab === 'dlr') fetchDlrDprSummary();
  }, [activeTab, dlrDprSubTab, dlrDprStartDate, dlrDprEndDate]);

  const fetchInventorySummary = async () => {
    setInvSummaryLoading(true);
    try {
      const res = await axios.get(`${API}/pm/inventory-summary`, { params: { start_date: invSummaryStartDate, end_date: invSummaryEndDate } });
      setInvSummaryRows(res.data?.rows || []);
    } catch {
      setInvSummaryRows([]);
      toast.error('Failed to load Inventory summary');
    } finally {
      setInvSummaryLoading(false);
    }
  };
  useEffect(() => {
    if (activeTab === 'dlrdpr' && dlrDprSubTab === 'inventory') fetchInventorySummary();
  }, [activeTab, dlrDprSubTab, invSummaryStartDate, invSummaryEndDate]);

  // === PROJECT HANDLERS ===
  const openStageDialog = (p) => { setSelectedProject(p); setNewStage(p.current_stage || 'yet_to_start'); setStageDialog(true); };
  const handleUpdateStage = async () => {
    if (!selectedProject || !newStage) return;
    try {
      await axios.patch(`${API}/planning/projects/${selectedProject.project_id}/update-stage?stage=${newStage}`);
      toast.success('Stage updated');
      setStageDialog(false); fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update stage'); }
  };

  const openAssignDialog = (p) => { setAssignProject(p); setSelectedSrSE(''); setSelectedSE(''); setAssignDialog(true); };
  const handleAssignTeam = async () => {
    if (!assignProject) return;
    const toAssign = [selectedSrSE, selectedSE].filter(Boolean);
    if (toAssign.length === 0) { toast.error('Select at least one team member'); return; }
    try {
      for (const uid of toAssign) {
        await axios.post(`${API}/pm/assign-team`, { project_id: assignProject.project_id, user_id: uid });
      }
      toast.success(`${toAssign.length} member(s) assigned`);
      setAssignDialog(false); fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to assign'); }
  };

  // === REQUEST HANDLERS ===
  const handleApproveMaterial = async (req) => {
    try {
      await axios.patch(`${API}/material-requests/${req.request_id}/planning-action`, null, { params: { action: 'approve' } });
      toast.success('Material request approved! Goes to Planning for final approval.');
      fetchData(false);
    } catch { toast.error('Failed to approve'); }
  };

  const handleApproveLabour = async (req, notes = '') => {
    try {
      if (req.rab_number && req.work_order_id && req.stage_id && req.project_id) {
        // New RAB stage payment request — PM-approve in the work_orders flow.
        const url = `${API}/projects/${req.project_id}/work-orders/${req.work_order_id}/stages/${req.stage_id}/payment-requests/${req.request_id}/pm-approve` + (notes ? `?notes=${encodeURIComponent(notes)}` : '');
        await axios.post(url);
        toast.success(`${req.rab_number} approved — forwarded to QC.`);
      } else {
        // Legacy labour_expense flow.
        await axios.patch(`${API}/pm/labour-requests/${req.labour_expense_id}/verify?action=approve` + (notes ? `&notes=${encodeURIComponent(notes)}` : ''));
        toast.success('Labour request approved! Goes to Accountant for payment approval.');
      }
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };
  // Helper passed to PMLabourReadOnlyList — opens the shared Reject reason dialog.
  const handleRejectLabour = (req) => openRejectDialog(req, req.rab_number ? 'labour_rab' : 'labour');

  const openRejectDialog = (req, type) => { setRejectTarget({ ...req, _type: type }); setRejectReason(''); setRejectDialog(true); };
  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      if (rejectTarget._type === 'material') {
        await axios.patch(`${API}/material-requests/${rejectTarget.request_id}/planning-action`, null, { params: { action: 'reject', reason: rejectReason } });
      } else if (rejectTarget._type === 'labour_rab') {
        await axios.post(
          `${API}/projects/${rejectTarget.project_id}/work-orders/${rejectTarget.work_order_id}/stages/${rejectTarget.stage_id}/payment-requests/${rejectTarget.request_id}/pm-reject`,
          { reason: rejectReason, send_back_to: 'site_engineer' }
        );
      } else {
        await axios.patch(`${API}/pm/labour-requests/${rejectTarget.labour_expense_id}/verify?action=reject&rejection_reason=${encodeURIComponent(rejectReason)}`);
      }
      toast.success('Rejected. Site Engineer will be notified.');
      setRejectDialog(false); fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reject'); }
  };

  // === TEAM HANDLERS ===
  const handleCreateSE = async () => {
    if (!seForm.name.trim()) { toast.error('Name required'); return; }
    try {
      await axios.post(`${API}/pm/create-site-engineer`, seForm);
      toast.success(`${seForm.role === 'sr_site_engineer' ? 'Sr. Site Engineer' : 'Site Engineer'} created`);
      setCreateSEDialog(false); setSEForm({ name: '', phone: '', email: '', role: 'site_engineer' });
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create'); }
  };

  const handleRemoveMember = async (m) => {
    if (!window.confirm(`Deactivate ${m.name}?`)) return;
    try {
      await axios.delete(`${API}/pm/team-members/${m.user_id}`);
      toast.success('Member deactivated');
      fetchData(false);
    } catch { toast.error('Failed'); }
  };

  const handleRemoveFromProject = async (projectId, userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this project?`)) return;
    try {
      await axios.delete(`${API}/pm/projects/${projectId}/team/${userId}`);
      toast.success('Removed from project');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to remove'); }
  };

  // === HELPERS ===
  const handleApprovePettyCash = async (pcId) => {
    try {
      await axios.patch(`${API}/pm/petty-cash/${pcId}/approve`, { remarks: '' });
      toast.success('Petty cash approved! Sent to Accountant.');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to approve'); }
  };

  const handleRejectPettyCash = async () => {
    if (!pcRejectTarget) return;
    try {
      await axios.patch(`${API}/pm/petty-cash/${pcRejectTarget.petty_cash_id}/reject`, { reason: pcRejectReason });
      toast.success('Petty cash rejected');
      setPcRejectDialog(false); fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reject'); }
  };

  const getStageBadge = (id) => {
    const s = stages.find(x => x.id === id);
    return <Badge variant="outline" className="text-xs capitalize">{s?.name || id?.replace(/_/g, ' ') || '-'}</Badge>;
  };
  const getRoleBadge = (role) => {
    const m = { site_engineer: 'bg-blue-100 text-blue-700', sr_site_engineer: 'bg-amber-100 text-amber-700', associate_pm: 'bg-purple-100 text-purple-700' };
    const label = { site_engineer: 'Site Engineer', sr_site_engineer: 'Sr. Site Engineer', associate_pm: 'Associate PM' };
    return <Badge className={`${m[role] || 'bg-gray-100 text-gray-700'} text-xs`}>{label[role] || role}</Badge>;
  };

  const filteredTeam = teamMembers.filter(m => !teamSearch || m.name.toLowerCase().includes(teamSearch.toLowerCase()));

  const requestCount = materialRequests.length + labourRequests.length;
  const pendingPcCount = pettyCashRequests.filter(r => r.status === 'requested').length;
  const CountBadge = ({ count }) => count > 0 ? <span className="ml-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] inline-flex items-center justify-center">{count}</span> : null;
  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  const filteredInvSummaryRows = invSummaryRows.filter(r => !invProjectSearch || r.project_name.toLowerCase().includes(invProjectSearch.toLowerCase()));
  const filteredDlrDprRows = dlrDprProjectSearch
    ? dlrDprRows.filter(r => (r.project_name || '').toLowerCase().includes(dlrDprProjectSearch.toLowerCase()))
    : dlrDprRows;

  if (loading && !user) return <div className="min-h-screen bg-gray-50"><div className="max-w-7xl mx-auto px-4 py-8"><div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-48" /></div></div></div>;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="pm-dashboard">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border shadow-sm mb-3 flex-wrap">
            <TabsTrigger value="all_projects" className="text-xs sm:text-sm" data-testid="tab-all-projects">All Projects</TabsTrigger>
            <TabsTrigger value="requests" className="text-xs sm:text-sm" data-testid="tab-requests">Requests<CountBadge count={requestCount} /></TabsTrigger>
            <TabsTrigger value="dlrdpr" className="text-xs sm:text-sm" data-testid="tab-dlrdpr">DLR & DPR</TabsTrigger>
          </TabsList>

          {/* ==================== ALL PROJECTS ==================== */}
          {/* Mirrors the Sr. Site Engineer Planning-style table view so the
              Project Manager gets the same fast, scannable layout. Clicking
              a row jumps to the SE project detail page so PMs use the exact
              same project workspace as the field team. */}
          <TabsContent value="all_projects">
            {projects.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center">
                  <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Projects</h3>
                  <p className="text-sm text-gray-600">No projects have been created yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4" data-testid="pm-projects-block">
                {/* KPI strip — Total / In Planning / In Construction / Completed */}
                {(() => {
                  const counts = projects.reduce((acc, p) => {
                    const k = (p.status || 'unknown').toLowerCase();
                    acc[k] = (acc[k] || 0) + 1;
                    acc.__total += 1;
                    return acc;
                  }, { __total: 0 });
                  const chips = [
                    { key: '__all', label: 'Total', count: counts.__total, cls: 'bg-gray-900 text-white' },
                    { key: 'in_planning', label: 'In Planning', count: counts['in_planning'] || 0, cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
                    { key: 'in_construction', label: 'In Construction', count: counts['in_construction'] || 0, cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
                    { key: 'completed', label: 'Completed', count: counts['completed'] || 0, cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
                  ];
                  return (
                    <div className="flex flex-wrap gap-2" data-testid="pm-projects-kpi-strip">
                      {chips.map(c => {
                        const active = (c.key === '__all' && !phaseFilter) || phaseFilter === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setPhaseFilter(c.key === '__all' ? '' : (phaseFilter === c.key ? '' : c.key))}
                            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] ${c.cls} ${active ? 'ring-2 ring-offset-1 ring-indigo-500' : 'opacity-90 hover:opacity-100'}`}
                            data-testid={`pm-projects-kpi-${c.key}`}
                          >
                            <span>{c.label}</span>
                            <span className={`tabular-nums ${active ? 'font-bold' : 'font-semibold'}`}>{c.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Search + filtered-count */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search project, client, phase or date…"
                      className="pl-9 h-9 text-sm bg-white border-indigo-200 focus-visible:ring-indigo-400"
                      data-testid="pm-projects-search"
                    />
                  </div>
                  {(projectSearch || phaseFilter) && (
                    <span className="text-xs text-gray-500 sm:ml-1" data-testid="pm-projects-filter-count">
                      Showing <span className="font-semibold text-indigo-700">{(() => {
                        const q = projectSearch.trim().toLowerCase();
                        return projects.filter(p => {
                          if (phaseFilter && (p.status || '').toLowerCase() !== phaseFilter) return false;
                          if (!q) return true;
                          const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                          return [p.name, p.client_name, (p.status || '').replace(/_/g, ' '), dateStr].filter(Boolean).join(' ').toLowerCase().includes(q);
                        }).length;
                      })()}</span> of {projects.length} projects
                    </span>
                  )}
                </div>

                <Card data-testid="pm-projects-table-card" className="overflow-hidden shadow-sm">
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="pm-projects-table">
                      <thead className="bg-gradient-to-r from-indigo-50 to-indigo-50/40 text-gray-700 border-b border-indigo-100">
                        <tr>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Project</th>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Client</th>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Phase</th>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Date</th>
                          <th className="text-right font-semibold px-4 py-3 uppercase text-[11px] tracking-wider w-44">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const q = projectSearch.trim().toLowerCase();
                          const visible = projects.filter((p) => {
                            if (phaseFilter && (p.status || '').toLowerCase() !== phaseFilter) return false;
                            if (!q) return true;
                            const dateStr = p.created_at
                              ? new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '';
                            const blob = [p.name, p.client_name, (p.status || '').replace(/_/g, ' '), dateStr].filter(Boolean).join(' ').toLowerCase();
                            return blob.includes(q);
                          });
                          if (visible.length === 0) {
                            return (
                              <tr>
                                <td colSpan={5} className="text-center text-gray-400 text-sm py-8" data-testid="pm-projects-empty">
                                  No projects match the current filter.
                                </td>
                              </tr>
                            );
                          }
                          const avatarPalette = [
                            'bg-amber-200 text-amber-800',
                            'bg-blue-200 text-blue-800',
                            'bg-emerald-200 text-emerald-800',
                            'bg-rose-200 text-rose-800',
                            'bg-violet-200 text-violet-800',
                            'bg-cyan-200 text-cyan-800',
                            'bg-orange-200 text-orange-800',
                          ];
                          const phaseTone = (s) => {
                            const k = (s || '').toLowerCase();
                            if (k === 'in_planning') return 'bg-amber-100 text-amber-800 border-amber-200';
                            if (k === 'in_construction') return 'bg-blue-100 text-blue-800 border-blue-200';
                            if (k === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                            if (k === 'on_hold' || k === 'cancelled') return 'bg-rose-100 text-rose-800 border-rose-200';
                            return 'bg-gray-100 text-gray-700 border-gray-200';
                          };
                          return visible.map((project, idx) => {
                            const dateStr = project.created_at
                              ? new Date(project.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—';
                            let h = 0;
                            for (const ch of (project.project_id || project.name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
                            const palette = avatarPalette[Math.abs(h) % avatarPalette.length];
                            const initials = (project.name || '?')
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map(w => w[0].toUpperCase())
                              .join('') || '?';
                            return (
                              <tr
                                key={project.project_id}
                                className={`group border-b last:border-b-0 cursor-pointer transition-all ${idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/20'} hover:bg-indigo-50/70`}
                                onClick={() => window.location.href = `/site-engineer/project/${project.project_id}`}
                                data-testid={`project-row-${project.project_id}`}
                              >
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  <div className="flex items-center gap-3">
                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold tracking-wide ${palette} flex-shrink-0 shadow-sm`}>{initials}</div>
                                    <div className="min-w-0">
                                      <div className="truncate font-semibold">{project.name}</div>
                                      {project.location && (
                                        <div className="text-[11px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                                          <MapPin className="h-3 w-3" />
                                          {project.location}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-700">{project.client_name || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={`text-[11px] font-medium ${phaseTone(project.status)}`}>
                                    {(project.status || 'unknown').replace(/_/g, ' ')}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{dateStr}</td>
                                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="inline-flex items-center gap-1 justify-end">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100"
                                      onClick={() => window.location.href = `/site-engineer/project/${project.project_id}`}
                                      data-testid={`project-row-view-${project.project_id}`}
                                      title="Open project (SE view)"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => openStageDialog(project)}
                                      title="Change stage"
                                      data-testid={`project-row-stage-${project.project_id}`}
                                    >
                                      <ArrowRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => openAssignDialog(project)}
                                      title="Assign team"
                                      data-testid={`project-row-assign-${project.project_id}`}
                                    >
                                      <UserPlus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ==================== REQUESTS ====================
              Feb 2026: split the single stacked list into three nested
              sub-tabs (Material / Labour RAB / Petty Cash) for cleaner
              navigation. The top-level Petty Cash / Labour RAB / Labour
              Advance tabs stay accessible for power-users who want the
              full-page approval queues. */}
          <TabsContent value="requests">
            <div className="space-y-3" data-testid="pm-requests-tab">
              <Tabs defaultValue="material_requests" className="w-full">
                <TabsList className="bg-amber-50/40 border border-amber-100 rounded-lg p-1 flex flex-wrap">
                  <TabsTrigger value="material_requests" className="text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm" data-testid="pm-req-sub-material">
                    Material Requests<CountBadge count={materialRequests?.length || 0} />
                  </TabsTrigger>
                  <TabsTrigger value="work_order_labour" className="text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm" data-testid="pm-req-sub-labour">
                    Work Order / Labour (RAB)<CountBadge count={labourRequests?.length || 0} />
                  </TabsTrigger>
                  <TabsTrigger value="petty_cash" className="text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm" data-testid="pm-req-sub-petty">
                    Petty Cash<CountBadge count={pendingPcCount} />
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="material_requests" className="mt-3">
                  <PMMaterialReadOnlyList items={materialRequests} />
                </TabsContent>
                <TabsContent value="work_order_labour" className="mt-3">
                  <PMLabourReadOnlyList
                    items={labourRequests}
                    onApprove={handleApproveLabour}
                    onReject={handleRejectLabour}
                  />
                </TabsContent>
                <TabsContent value="petty_cash" className="mt-3">
                  <PMPettyCashTabs pettyCashRequests={pettyCashRequests} onRefresh={() => fetchData(false)} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          {/* ==================== DLR & DPR ==================== */}
          <TabsContent value="dlrdpr">
            <div className="flex items-center gap-2 mb-3" data-testid="dlrdpr-subtabs">
              <button
                type="button"
                onClick={() => setDlrDprSubTab('dlr')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md border-2 transition ${dlrDprSubTab === 'dlr' ? 'border-orange-600 bg-orange-100 text-orange-900' : 'border-gray-300 bg-gray-50 text-gray-700 hover:brightness-95'}`}
                data-testid="dlrdpr-subtab-dlr"
              >
                DLR & DPR
              </button>
              <button
                type="button"
                onClick={() => setDlrDprSubTab('inventory')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-md border-2 transition ${dlrDprSubTab === 'inventory' ? 'border-orange-600 bg-orange-100 text-orange-900' : 'border-gray-300 bg-gray-50 text-gray-700 hover:brightness-95'}`}
                data-testid="dlrdpr-subtab-inventory"
              >
                Inventory
              </button>
            </div>

            {dlrDprSubTab === 'dlr' ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">DLR & DPR — All Projects</CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">One line per DLR — works count, amount, and stage for the selected date range.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search project..."
                          value={dlrDprProjectSearch}
                          onChange={(e) => setDlrDprProjectSearch(e.target.value)}
                          className="pl-8 h-9 w-44 text-sm"
                          data-testid="dlrdpr-project-search"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-gray-500">Start Date</Label>
                        <input
                          type="date"
                          value={dlrDprStartDate}
                          max={dlrDprEndDate}
                          onChange={(e) => setDlrDprStartDate(e.target.value)}
                          className="h-9 px-2 border rounded-md text-sm"
                          data-testid="dlrdpr-start-date-picker"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-gray-500">End Date</Label>
                        <input
                          type="date"
                          value={dlrDprEndDate}
                          min={dlrDprStartDate}
                          onChange={(e) => setDlrDprEndDate(e.target.value)}
                          className="h-9 px-2 border rounded-md text-sm"
                          data-testid="dlrdpr-end-date-picker"
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {!dlrDprLoading && filteredDlrDprRows.length > 0 && (() => {
                  const dlrEntryCount = filteredDlrDprRows.filter(r => r.dlr_id).length;
                  const pills = [
                    { label: 'Total Works Count', value: filteredDlrDprRows.reduce((s, r) => s + (r.works_count || 0), 0), cls: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                    { label: 'Skilled', value: filteredDlrDprRows.reduce((s, r) => s + (r.skilled || 0), 0), cls: 'bg-blue-50 border-blue-200 text-blue-700' },
                    { label: 'Semi-Skilled', value: filteredDlrDprRows.reduce((s, r) => s + (r.semi_skilled || 0), 0), cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                    { label: 'Unskilled', value: filteredDlrDprRows.reduce((s, r) => s + (r.unskilled || 0), 0), cls: 'bg-gray-50 border-gray-200 text-gray-700' },
                    { label: 'Total Amount', value: formatCurrency(filteredDlrDprRows.reduce((s, r) => s + (r.amount || 0), 0)), cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                    { label: 'DLR Entry Count', value: dlrEntryCount, cls: 'bg-violet-50 border-violet-200 text-violet-700' },
                  ];
                  return (
                    <div className="flex gap-1.5 sm:gap-3 px-4 pb-4 overflow-x-auto" data-testid="dlrdpr-summary-pills">
                      {pills.map(p => (
                        <div key={p.label} className={`flex-1 min-w-0 flex flex-col items-center justify-center rounded-2xl px-2 py-3 sm:py-5 shadow-sm border ${p.cls}`}>
                          <span className="text-[9px] sm:text-xs font-medium text-center leading-tight">{p.label}</span>
                          <span className="text-base sm:text-2xl font-bold mt-0.5">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <CardContent className="p-0">
                  {dlrDprLoading ? (
                    <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
                  ) : filteredDlrDprRows.length === 0 ? (
                    <p className="text-center text-gray-400 py-10 text-sm" data-testid="dlrdpr-empty">
                      {dlrDprProjectSearch ? 'No matching projects.' : 'No projects found for this date range.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto" data-testid="dlrdpr-table">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-y">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">S.No</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Project</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Stage</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Contractor</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Works Count</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Skilled</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Semi-Skilled</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Unskilled</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredDlrDprRows.map((row, idx) => (
                            <tr
                              key={row.dlr_id || `${row.project_id}-${idx}`}
                              className="hover:bg-orange-50/50 cursor-pointer"
                              data-testid={`dlrdpr-row-${row.dlr_id || idx}`}
                              onClick={() => window.location.href = `/site-engineer/project/${row.project_id}`}
                            >
                              <td className="px-3 py-2 text-gray-500 align-top">{idx + 1}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap align-top">
                                {row.date ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-900 align-top">
                                <span className="inline-flex items-center gap-1.5">
                                  {row.dlr_id && <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" title="Has a DLR entry" data-testid={`dlrdpr-has-entry-dot-${row.dlr_id}`} />}
                                  {row.project_name}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600 align-top">{row.stage_name || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-gray-600 align-top">{row.contractor_name || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-right align-top">{row.works_count}</td>
                              <td className="px-3 py-2 text-right align-top">{row.skilled}</td>
                              <td className="px-3 py-2 text-right align-top">{row.semi_skilled}</td>
                              <td className="px-3 py-2 text-right align-top">{row.unskilled}</td>
                              <td className="px-3 py-2 text-right font-medium align-top">{formatCurrency(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t font-semibold">
                          <tr>
                            <td className="px-3 py-2" colSpan={5}>Total</td>
                            <td className="px-3 py-2 text-right">{filteredDlrDprRows.reduce((s, r) => s + (r.works_count || 0), 0)}</td>
                            <td className="px-3 py-2 text-right">{filteredDlrDprRows.reduce((s, r) => s + (r.skilled || 0), 0)}</td>
                            <td className="px-3 py-2 text-right">{filteredDlrDprRows.reduce((s, r) => s + (r.semi_skilled || 0), 0)}</td>
                            <td className="px-3 py-2 text-right">{filteredDlrDprRows.reduce((s, r) => s + (r.unskilled || 0), 0)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(filteredDlrDprRows.reduce((s, r) => s + (r.amount || 0), 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2"><Package className="h-5 w-5 text-orange-600" /> Inventory — All Projects</CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">Project-wise current stock, unit rate, plus stock-in and stock-out for the selected date range.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search project..."
                          value={invProjectSearch}
                          onChange={(e) => setInvProjectSearch(e.target.value)}
                          className="pl-8 h-9 w-48 text-sm"
                          data-testid="inv-summary-project-search"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-gray-500">Start Date</Label>
                        <input
                          type="date"
                          value={invSummaryStartDate}
                          max={invSummaryEndDate}
                          onChange={(e) => setInvSummaryStartDate(e.target.value)}
                          className="h-9 px-2 border rounded-md text-sm"
                          data-testid="inv-summary-start-date-picker"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-gray-500">End Date</Label>
                        <input
                          type="date"
                          value={invSummaryEndDate}
                          min={invSummaryStartDate}
                          onChange={(e) => setInvSummaryEndDate(e.target.value)}
                          className="h-9 px-2 border rounded-md text-sm"
                          data-testid="inv-summary-end-date-picker"
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {invSummaryLoading ? (
                    <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
                  ) : filteredInvSummaryRows.length === 0 ? (
                    <p className="text-center text-gray-400 py-10 text-sm" data-testid="inv-summary-empty">
                      {invProjectSearch ? 'No matching projects.' : 'No inventory recorded yet across your projects.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto" data-testid="inv-summary-table">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-y">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">S.No</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Project</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Unit</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Unit (Rate)</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Current Stock</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Today In</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Today Out</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredInvSummaryRows.map((row, idx) => (
                            <tr
                              key={`${row.project_id}-${row.material_name}-${idx}`}
                              className="hover:bg-orange-50/50 cursor-pointer"
                              data-testid={`inv-summary-row-${idx}`}
                              onClick={() => window.location.href = `/site-engineer/project/${row.project_id}`}
                            >
                              <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-900">{row.project_name}</td>
                              <td className="px-3 py-2 text-gray-700">{row.material_name}</td>
                              <td className="px-3 py-2 text-gray-500">{row.unit || '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{row.unit_rate > 0 ? formatCurrency(row.unit_rate) : '—'}</td>
                              <td className="px-3 py-2 text-right font-medium">{row.current_stock}</td>
                              <td className="px-3 py-2 text-right text-emerald-700">{row.today_in > 0 ? `+${row.today_in}` : row.today_in}</td>
                              <td className="px-3 py-2 text-right text-red-700">{row.today_out > 0 ? `-${row.today_out}` : row.today_out}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>


          {/* Top-level Petty Cash / Labour RAB / Labour Advance tabs removed
              (Feb 2026). Petty Cash and Labour RAB are now nested as
              sub-tabs inside the Requests tab. Labour Advance is no longer
              surfaced at the PM dashboard level — accessible via the
              project drill-down if needed. */}

          {/* ==================== TEAM ==================== */}
          <TabsContent value="team">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-indigo-600" />Team Members ({filteredTeam.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                    <Button size="sm" onClick={() => { setSEForm({ name: '', phone: '', email: '', role: 'site_engineer' }); setCreateSEDialog(true); }} className="bg-indigo-600 hover:bg-indigo-700" data-testid="create-se-btn"><Plus className="h-4 w-4 mr-1" />Create Site Engineer</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="team-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Contact</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Active Projects</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredTeam.length === 0 ? (
                        <tr><td colSpan="5" className="p-8 text-center text-gray-400">No team members</td></tr>
                      ) : filteredTeam.map((m) => (
                        <tr key={m.user_id} className="hover:bg-gray-50" data-testid={`team-row-${m.user_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{m.name}</p></td>
                          <td className="px-4 py-2.5 text-center">{getRoleBadge(m.role)}</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-gray-500">{m.phone || m.email || '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="text-sm font-medium">{m.active_projects || 0}</span>
                            {(m.assignments || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 justify-center">{m.assignments.slice(0,2).map(a => <span key={a.assignment_id} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{a.project_name}</span>)}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleRemoveMember(m)} title="Deactivate"><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ==================== DIALOGS ==================== */}

      {/* Stage Update */}
      <Dialog open={stageDialog} onOpenChange={setStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Project Stage</DialogTitle><DialogDescription>Move "{selectedProject?.name}" to a new construction stage</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Current Stage</Label><div className="mt-1">{getStageBadge(selectedProject?.current_stage)}</div></div>
            <div><Label>Move to</Label><Select value={newStage} onValueChange={setNewStage}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStageDialog(false)}>Cancel</Button><Button onClick={handleUpdateStage} className="bg-indigo-600 hover:bg-indigo-700">Update Stage</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Team */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign Team to Project</DialogTitle><DialogDescription>Assign engineers to "{assignProject?.name}"</DialogDescription></DialogHeader>
          <div className="py-3 space-y-4">
            {/* Currently assigned */}
            {assignProject?.team?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Currently Assigned</p>
                <div className="space-y-1">
                  {assignProject.team.map(t => (
                    <div key={t.user_id} className="flex items-center justify-between bg-gray-50 rounded px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        {getRoleBadge(t.role)}
                        <span className="text-sm">{t.name}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleRemoveFromProject(assignProject.project_id, t.user_id, t.name)} data-testid={`remove-from-project-${t.user_id}`}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sr. Site Engineer dropdown */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />Senior Site Engineer
              </Label>
              <Select value={selectedSrSE} onValueChange={setSelectedSrSE}>
                <SelectTrigger className="mt-1" data-testid="select-sr-se"><SelectValue placeholder="Select Sr. Site Engineer" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.filter(m => m.role === 'sr_site_engineer' && m.is_active !== false && !(assignProject?.team || []).find(t => t.user_id === m.user_id)).map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name} ({m.active_projects || 0} projects)
                    </SelectItem>
                  ))}
                  {teamMembers.filter(m => m.role === 'sr_site_engineer' && m.is_active !== false && !(assignProject?.team || []).find(t => t.user_id === m.user_id)).length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-gray-400">No available Sr. Site Engineers</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Site Engineer dropdown */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />Site Engineer
              </Label>
              <Select value={selectedSE} onValueChange={setSelectedSE}>
                <SelectTrigger className="mt-1" data-testid="select-se"><SelectValue placeholder="Select Site Engineer" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.filter(m => m.role === 'site_engineer' && m.is_active !== false && !(assignProject?.team || []).find(t => t.user_id === m.user_id)).map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name} ({m.active_projects || 0} projects)
                    </SelectItem>
                  ))}
                  {teamMembers.filter(m => m.role === 'site_engineer' && m.is_active !== false && !(assignProject?.team || []).find(t => t.user_id === m.user_id)).length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-gray-400">No available Site Engineers</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button><Button onClick={handleAssignTeam} className="bg-indigo-600 hover:bg-indigo-700" data-testid="confirm-assign">Assign Selected</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Request */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Request</DialogTitle></DialogHeader>
          <div className="py-4"><Label>Reason</Label><Input placeholder="Reason for rejection" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-2" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button><Button variant="destructive" onClick={handleReject}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Site Engineer */}
      <Dialog open={createSEDialog} onOpenChange={setCreateSEDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Site Engineer</DialogTitle><DialogDescription>Add a new site engineer to your team</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={seForm.name} onChange={(e) => setSEForm({ ...seForm, name: e.target.value })} placeholder="Full name" className="mt-1" data-testid="se-name-input" /></div>
            <div><Label>Role</Label>
              <Select value={seForm.role} onValueChange={(v) => setSEForm({ ...seForm, role: v })}>
                <SelectTrigger className="mt-1" data-testid="se-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="site_engineer">Site Engineer</SelectItem>
                  <SelectItem value="sr_site_engineer">Sr. Site Engineer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={seForm.phone} onChange={(e) => setSEForm({ ...seForm, phone: e.target.value })} placeholder="+91..." className="mt-1" /></div>
              <div><Label>Email</Label><Input value={seForm.email} onChange={(e) => setSEForm({ ...seForm, email: e.target.value })} placeholder="email" className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateSEDialog(false)}>Cancel</Button><Button onClick={handleCreateSE} className="bg-indigo-600 hover:bg-indigo-700" data-testid="confirm-create-se">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petty Cash Reject Dialog */}
      <Dialog open={pcRejectDialog} onOpenChange={setPcRejectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Reject Petty Cash</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this request.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input value={pcRejectReason} onChange={e => setPcRejectReason(e.target.value)} placeholder="Enter rejection reason..." className="mt-1" data-testid="pc-reject-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPcRejectDialog(false)}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleRejectPettyCash} data-testid="pc-reject-confirm">Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
