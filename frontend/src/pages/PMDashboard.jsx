import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Building2, Eye, Users, ArrowRight, Check, X, Plus, Search,
  Trash2, Edit, ClipboardList, UserPlus, HardHat, Package
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PMDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all_projects');

  // Projects
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [stages, setStages] = useState([]);
  const [stageDialog, setStageDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newStage, setNewStage] = useState('');

  // Team Assignment
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignProject, setAssignProject] = useState(null);
  const [assignUserId, setAssignUserId] = useState('');

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

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['project_manager', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);

      const [projRes, matReqRes, labReqRes, teamRes, stagesRes] = await Promise.allSettled([
        axios.get(`${API}/pm/projects`),
        axios.get(`${API}/pm/material-requests`),
        axios.get(`${API}/pm/labour-requests`),
        axios.get(`${API}/pm/team-members`),
        axios.get(`${API}/pm/project-stages`)
      ]);

      if (projRes.status === 'fulfilled') setProjects(projRes.value.data || []);
      if (matReqRes.status === 'fulfilled') setMaterialRequests(matReqRes.value.data || []);
      if (labReqRes.status === 'fulfilled') setLabourRequests(labReqRes.value.data || []);
      if (teamRes.status === 'fulfilled') setTeamMembers(teamRes.value.data || []);
      if (stagesRes.status === 'fulfilled') setStages(stagesRes.value.data || []);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };

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

  const openAssignDialog = (p) => { setAssignProject(p); setAssignUserId(''); setAssignDialog(true); };
  const handleAssignTeam = async () => {
    if (!assignProject || !assignUserId) { toast.error('Select a team member'); return; }
    try {
      await axios.post(`${API}/pm/assign-team`, { project_id: assignProject.project_id, user_id: assignUserId });
      toast.success('Team member assigned');
      setAssignDialog(false); fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to assign'); }
  };

  // === REQUEST HANDLERS ===
  const handleApproveMaterial = async (req) => {
    try {
      await axios.patch(`${API}/material-requests/${req.request_id}/planning-action`, null, { params: { action: 'approve' } });
      toast.success('Material request approved');
      fetchData(false);
    } catch { toast.error('Failed to approve'); }
  };

  const handleApproveLabour = async (req) => {
    try {
      await axios.patch(`${API}/pm/labour-requests/${req.labour_expense_id}/verify?action=approve`);
      toast.success('Labour request approved');
      fetchData(false);
    } catch { toast.error('Failed to approve'); }
  };

  const openRejectDialog = (req, type) => { setRejectTarget({ ...req, _type: type }); setRejectReason(''); setRejectDialog(true); };
  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      if (rejectTarget._type === 'material') {
        await axios.patch(`${API}/material-requests/${rejectTarget.request_id}/planning-action`, null, { params: { action: 'reject', reason: rejectReason } });
      } else {
        await axios.patch(`${API}/pm/labour-requests/${rejectTarget.labour_expense_id}/verify?action=reject&rejection_reason=${encodeURIComponent(rejectReason)}`);
      }
      toast.success('Request rejected');
      setRejectDialog(false); fetchData(false);
    } catch { toast.error('Failed to reject'); }
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

  // === HELPERS ===
  const getStageBadge = (id) => {
    const s = stages.find(x => x.id === id);
    return <Badge variant="outline" className="text-xs capitalize">{s?.name || id?.replace(/_/g, ' ') || '-'}</Badge>;
  };
  const getRoleBadge = (role) => {
    const m = { site_engineer: 'bg-blue-100 text-blue-700', sr_site_engineer: 'bg-amber-100 text-amber-700', associate_pm: 'bg-purple-100 text-purple-700' };
    const label = { site_engineer: 'Site Engineer', sr_site_engineer: 'Sr. Site Engineer', associate_pm: 'Associate PM' };
    return <Badge className={`${m[role] || 'bg-gray-100 text-gray-700'} text-xs`}>{label[role] || role}</Badge>;
  };

  const filteredProjects = projects.filter(p => !projectSearch || (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) || (p.client_name || '').toLowerCase().includes(projectSearch.toLowerCase()));
  const filteredTeam = teamMembers.filter(m => !teamSearch || m.name.toLowerCase().includes(teamSearch.toLowerCase()));

  const requestCount = materialRequests.length + labourRequests.length;
  const CountBadge = ({ count }) => count > 0 ? <span className="ml-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] inline-flex items-center justify-center">{count}</span> : null;

  if (loading) return <div className="min-h-screen bg-gray-50"><div className="max-w-7xl mx-auto px-4 py-8"><div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-48" /></div></div></div>;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="pm-dashboard">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border shadow-sm mb-3 flex-wrap">
            <TabsTrigger value="all_projects" className="text-xs sm:text-sm" data-testid="tab-all-projects">All Projects</TabsTrigger>
            <TabsTrigger value="requests" className="text-xs sm:text-sm" data-testid="tab-requests">Requests<CountBadge count={requestCount} /></TabsTrigger>
            <TabsTrigger value="team" className="text-xs sm:text-sm" data-testid="tab-team">Team ({teamMembers.length})</TabsTrigger>
          </TabsList>

          {/* ==================== ALL PROJECTS ==================== */}
          <TabsContent value="all_projects">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-indigo-600" />All Projects ({filteredProjects.length})</CardTitle>
                  <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="project-search" /></div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="projects-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Stage</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredProjects.length === 0 ? (
                        <tr><td colSpan="5" className="p-8 text-center text-gray-400">No projects found</td></tr>
                      ) : filteredProjects.map((p) => (
                        <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`project-row-${p.project_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{p.name}</p><p className="text-xs text-gray-400">{p.location || '-'}</p></td>
                          <td className="px-4 py-2.5 text-gray-600">{p.client_name}</td>
                          <td className="px-4 py-2.5 text-center">{getStageBadge(p.current_stage || 'yet_to_start')}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(p.team || []).length > 0 ? p.team.map(t => (
                                <span key={t.user_id} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t.name} <span className="text-blue-400">({t.role?.replace(/_/g, ' ')})</span></span>
                              )) : <span className="text-xs text-gray-400">No team assigned</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.location.href = `/projects/${p.project_id}`} data-testid={`view-project-${p.project_id}`}><Eye className="h-3 w-3 mr-1" />View</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openStageDialog(p)} title="Change Stage"><ArrowRight className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAssignDialog(p)} data-testid={`assign-team-${p.project_id}`}><UserPlus className="h-3 w-3 mr-1" />Assign</Button>
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

          {/* ==================== REQUESTS ==================== */}
          <TabsContent value="requests">
            <div className="space-y-4">
              {/* Material Requests */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-blue-600" />Material Requests ({materialRequests.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {materialRequests.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No pending material requests</div>
                  ) : (
                    <div className="divide-y">
                      {materialRequests.map((req) => (
                        <div key={req.request_id} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`mat-req-${req.request_id}`}>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{req.material_name}</p>
                            <p className="text-xs text-gray-500">Project: {req.project_name} | By: {req.requester_name}</p>
                            <p className="text-xs text-gray-500">Qty: {req.quantity} {req.unit} | Priority: <span className={req.priority === 'urgent' ? 'text-red-600 font-medium' : ''}>{req.priority || 'normal'}</span></p>
                            {req.notes && <p className="text-xs text-gray-400 mt-0.5">{req.notes}</p>}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => handleApproveMaterial(req)}><Check className="h-3 w-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => openRejectDialog(req, 'material')}><X className="h-3 w-3 mr-1" />Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Labour Requests */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><HardHat className="h-4 w-4 text-amber-600" />Labour Requests ({labourRequests.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {labourRequests.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No pending labour requests</div>
                  ) : (
                    <div className="divide-y">
                      {labourRequests.map((req) => (
                        <div key={req.labour_expense_id} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`lab-req-${req.labour_expense_id}`}>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{req.labour_type || req.description}</p>
                            <p className="text-xs text-gray-500">Project: {req.project_name} | Workers: {req.workers_count} | Days: {req.days}</p>
                            {req.contractor_name && <p className="text-xs text-gray-500">Contractor: {req.contractor_name}</p>}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => handleApproveLabour(req)}><Check className="h-3 w-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => openRejectDialog(req, 'labour')}><X className="h-3 w-3 mr-1" />Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

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
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Team to Project</DialogTitle><DialogDescription>Assign a Site Engineer or Sr. Site Engineer to "{assignProject?.name}"</DialogDescription></DialogHeader>
          <div className="py-4">
            <Label>Select Team Member</Label>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger className="mt-1" data-testid="select-team-member"><SelectValue placeholder="Choose team member" /></SelectTrigger>
              <SelectContent>
                {teamMembers.filter(m => m.is_active !== false).map(m => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name} ({m.role?.replace(/_/g, ' ')}) - {m.active_projects || 0} projects
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignProject?.team?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1">Currently assigned:</p>
                <div className="flex flex-wrap gap-1">{assignProject.team.map(t => <Badge key={t.user_id} variant="outline" className="text-xs">{t.name} ({t.role?.replace(/_/g,' ')})</Badge>)}</div>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button><Button onClick={handleAssignTeam} className="bg-indigo-600 hover:bg-indigo-700" data-testid="confirm-assign">Assign</Button></DialogFooter>
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

      <MobileBottomNav user={user} />
    </div>
  );
}
