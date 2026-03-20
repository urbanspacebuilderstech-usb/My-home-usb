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
  Building2, Eye, Search, Plus, Trash2, Edit, Check, X,
  Send, ExternalLink, Layers, Image, FileText, Filter, ArrowLeft
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  yet_to_start: { label: 'Yet to Start', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  design: { label: 'Design', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  approval_waiting: { label: 'Approval Waiting', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700 border-green-300' },
};

export default function ArchitectDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Projects
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Selected project detail
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectTab, setProjectTab] = useState('site_plans');

  // Site Plans
  const [sitePlans, setSitePlans] = useState([]);
  const [planDialog, setPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ floor_name: '', drive_link: '', remarks: '' });

  // Design Files
  const [designFiles, setDesignFiles] = useState([]);
  const [fileDialog, setFileDialog] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [fileForm, setFileForm] = useState({ file_name: '', file_type: '3d_photo', drive_link: '', remarks: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['architect', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);
      const projRes = await axios.get(`${API}/architect/projects`);
      setProjects(projRes.data || []);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 15000);

  const openProjectDetail = async (project) => {
    setSelectedProject(project);
    setProjectTab('site_plans');
    await fetchProjectDesignData(project.project_id);
  };

  const fetchProjectDesignData = async (projectId) => {
    try {
      const [plansRes, filesRes] = await Promise.allSettled([
        axios.get(`${API}/architect/projects/${projectId}/site-plans`),
        axios.get(`${API}/architect/projects/${projectId}/design-files`),
      ]);
      if (plansRes.status === 'fulfilled') setSitePlans(plansRes.value.data || []);
      if (filesRes.status === 'fulfilled') setDesignFiles(filesRes.value.data || []);
    } catch { /* handled by individual catches */ }
  };

  // ---- Site Plan Handlers ----
  const openAddPlan = () => { setEditingPlan(null); setPlanForm({ floor_name: '', drive_link: '', remarks: '' }); setPlanDialog(true); };
  const openEditPlan = (plan) => { setEditingPlan(plan); setPlanForm({ floor_name: plan.floor_name, drive_link: plan.drive_link || '', remarks: plan.remarks || '' }); setPlanDialog(true); };

  const handleSavePlan = async () => {
    if (!planForm.floor_name.trim()) { toast.error('Floor name required'); return; }
    try {
      if (editingPlan) {
        await axios.patch(`${API}/architect/projects/${selectedProject.project_id}/site-plans/${editingPlan.plan_id}`, planForm);
        toast.success('Site plan updated');
      } else {
        await axios.post(`${API}/architect/projects/${selectedProject.project_id}/site-plans`, planForm);
        toast.success('Site plan added');
      }
      setPlanDialog(false);
      fetchProjectDesignData(selectedProject.project_id);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleDeletePlan = async (plan) => {
    if (!window.confirm(`Delete "${plan.floor_name}"?`)) return;
    try {
      await axios.delete(`${API}/architect/projects/${selectedProject.project_id}/site-plans/${plan.plan_id}`);
      toast.success('Deleted');
      fetchProjectDesignData(selectedProject.project_id);
    } catch { toast.error('Failed to delete'); }
  };

  const handleSubmitPlan = async (plan) => {
    if (!window.confirm(`Submit "${plan.floor_name}" for GM approval?`)) return;
    try {
      await axios.post(`${API}/architect/projects/${selectedProject.project_id}/site-plans/${plan.plan_id}/submit`);
      toast.success('Submitted! Goes to GM for approval.');
      fetchProjectDesignData(selectedProject.project_id);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit'); }
  };

  const handleChangePlanStatus = async (plan, newStatus) => {
    try {
      await axios.patch(`${API}/architect/projects/${selectedProject.project_id}/site-plans/${plan.plan_id}`, { status: newStatus });
      toast.success('Status updated');
      fetchProjectDesignData(selectedProject.project_id);
    } catch { toast.error('Failed to update status'); }
  };

  // ---- Design File Handlers ----
  const openAddFile = (type) => { setEditingFile(null); setFileForm({ file_name: '', file_type: type || '3d_photo', drive_link: '', remarks: '' }); setFileDialog(true); };
  const openEditFile = (file) => { setEditingFile(file); setFileForm({ file_name: file.file_name, file_type: file.file_type, drive_link: file.drive_link || '', remarks: file.remarks || '' }); setFileDialog(true); };

  const handleSaveFile = async () => {
    if (!fileForm.file_name.trim()) { toast.error('File name required'); return; }
    try {
      if (editingFile) {
        await axios.patch(`${API}/architect/projects/${selectedProject.project_id}/design-files/${editingFile.file_id}`, fileForm);
        toast.success('Design file updated');
      } else {
        await axios.post(`${API}/architect/projects/${selectedProject.project_id}/design-files`, fileForm);
        toast.success('Design file added');
      }
      setFileDialog(false);
      fetchProjectDesignData(selectedProject.project_id);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Delete "${file.file_name}"?`)) return;
    try {
      await axios.delete(`${API}/architect/projects/${selectedProject.project_id}/design-files/${file.file_id}`);
      toast.success('Deleted');
      fetchProjectDesignData(selectedProject.project_id);
    } catch { toast.error('Failed to delete'); }
  };

  // ---- Helpers ----
  const filteredProjects = projects.filter(p => {
    const matchSearch = !projectSearch ||
      (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) ||
      (p.client_name || '').toLowerCase().includes(projectSearch.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const CountBadge = ({ count }) => count > 0 ? <span className="ml-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] inline-flex items-center justify-center">{count}</span> : null;

  const photos3d = designFiles.filter(f => f.file_type === '3d_photo');
  const elevations = designFiles.filter(f => f.file_type === 'elevation');

  if (loading && !user) return <div className="min-h-screen bg-gray-50"><div className="max-w-7xl mx-auto px-4 py-8"><div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-48" /></div></div></div>;

  // ==================== PROJECT DETAIL VIEW ====================
  if (selectedProject) {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="architect-project-detail">
        <AppHeader user={user} />
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          {/* Back + Project Info */}
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)} data-testid="back-to-projects">
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <div>
              <h2 className="text-lg font-bold">{selectedProject.name}</h2>
              <p className="text-xs text-gray-500">Client: {selectedProject.client_name} | {selectedProject.location || selectedProject.city || '-'}</p>
            </div>
          </div>

          <Tabs value={projectTab} onValueChange={setProjectTab}>
            <TabsList className="bg-white border shadow-sm mb-3">
              <TabsTrigger value="site_plans" className="text-xs sm:text-sm" data-testid="tab-site-plans">
                <Layers className="h-3 w-3 mr-1" />Site Plans ({sitePlans.length})
              </TabsTrigger>
              <TabsTrigger value="3d_elevations" className="text-xs sm:text-sm" data-testid="tab-3d-elevations">
                <Image className="h-3 w-3 mr-1" />3D & Elevations ({designFiles.length})
              </TabsTrigger>
            </TabsList>

            {/* ==================== SITE PLANS ==================== */}
            <TabsContent value="site_plans">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="h-4 w-4 text-indigo-600" />Site Plans
                    </CardTitle>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={openAddPlan} data-testid="add-site-plan-btn">
                      <Plus className="h-4 w-4 mr-1" />Add Floor
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {sitePlans.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No site plans yet. Click "Add Floor" to start.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="site-plans-table">
                        <thead className="bg-gray-50 border-y">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">S.No</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Floor Name</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Google Drive Link</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {sitePlans.map((plan, idx) => (
                            <tr key={plan.plan_id} className="hover:bg-gray-50" data-testid={`site-plan-row-${plan.plan_id}`}>
                              <td className="px-4 py-2.5 font-medium">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-medium">{plan.floor_name}</td>
                              <td className="px-4 py-2.5 text-center">
                                {plan.drive_link ? (
                                  <a href={plan.drive_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                                    <ExternalLink className="h-3 w-3" />Open
                                  </a>
                                ) : <span className="text-gray-400 text-xs">-</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <Badge className={`text-xs border ${STATUS_CONFIG[plan.status]?.color || 'bg-gray-100'}`}>
                                  {STATUS_CONFIG[plan.status]?.label || plan.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[200px] truncate">{plan.remarks || '-'}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex justify-center gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEditPlan(plan)} title="Edit">
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  {plan.status !== 'approved' && plan.status !== 'approval_waiting' && (
                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600" onClick={() => handleSubmitPlan(plan)} title="Submit for Approval" data-testid={`submit-plan-${plan.plan_id}`}>
                                      <Send className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {plan.status === 'yet_to_start' && (
                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600" onClick={() => handleChangePlanStatus(plan, 'design')} title="Move to Design">
                                      <FileText className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleDeletePlan(plan)} title="Delete">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Status Summary */}
              {sitePlans.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <div key={key} className={`rounded-lg p-3 text-center border ${cfg.color}`}>
                      <p className="text-xl font-bold">{sitePlans.filter(p => p.status === key).length}</p>
                      <p className="text-xs">{cfg.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ==================== 3D & ELEVATIONS ==================== */}
            <TabsContent value="3d_elevations">
              <div className="space-y-4">
                {/* 3D Photos */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Image className="h-4 w-4 text-purple-600" />3D Photos ({photos3d.length})
                      </CardTitle>
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => openAddFile('3d_photo')} data-testid="add-3d-photo-btn">
                        <Plus className="h-4 w-4 mr-1" />Add 3D Photo
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {photos3d.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">No 3D photos uploaded yet</div>
                    ) : (
                      <div className="divide-y">
                        {photos3d.map((file) => (
                          <div key={file.file_id} className="flex items-center justify-between p-3 hover:bg-gray-50" data-testid={`design-file-${file.file_id}`}>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{file.file_name}</p>
                              {file.remarks && <p className="text-xs text-gray-400">{file.remarks}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              {file.drive_link && (
                                <a href={file.drive_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs border border-blue-200 rounded px-2 py-1">
                                  <ExternalLink className="h-3 w-3" />Drive
                                </a>
                              )}
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => openEditFile(file)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDeleteFile(file)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Elevations */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-teal-600" />Elevation Photos ({elevations.length})
                      </CardTitle>
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => openAddFile('elevation')} data-testid="add-elevation-btn">
                        <Plus className="h-4 w-4 mr-1" />Add Elevation
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {elevations.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">No elevation photos uploaded yet</div>
                    ) : (
                      <div className="divide-y">
                        {elevations.map((file) => (
                          <div key={file.file_id} className="flex items-center justify-between p-3 hover:bg-gray-50" data-testid={`design-file-${file.file_id}`}>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{file.file_name}</p>
                              {file.remarks && <p className="text-xs text-gray-400">{file.remarks}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              {file.drive_link && (
                                <a href={file.drive_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 text-xs border border-teal-200 rounded px-2 py-1">
                                  <ExternalLink className="h-3 w-3" />Drive
                                </a>
                              )}
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => openEditFile(file)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDeleteFile(file)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ==================== DIALOGS ==================== */}

        {/* Site Plan Dialog */}
        <Dialog open={planDialog} onOpenChange={setPlanDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPlan ? 'Edit Site Plan' : 'Add Site Plan'}</DialogTitle>
              <DialogDescription>Floor-wise site plan with Google Drive link</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Floor Name *</Label>
                <Input value={planForm.floor_name} onChange={e => setPlanForm({ ...planForm, floor_name: e.target.value })} placeholder="e.g. Ground Floor, First Floor" className="mt-1" data-testid="plan-floor-name" />
              </div>
              <div>
                <Label>Google Drive Link</Label>
                <Input value={planForm.drive_link} onChange={e => setPlanForm({ ...planForm, drive_link: e.target.value })} placeholder="https://drive.google.com/..." className="mt-1" data-testid="plan-drive-link" />
              </div>
              <div>
                <Label>Remarks</Label>
                <Input value={planForm.remarks} onChange={e => setPlanForm({ ...planForm, remarks: e.target.value })} placeholder="Any notes" className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlanDialog(false)}>Cancel</Button>
              <Button onClick={handleSavePlan} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-plan-btn">
                {editingPlan ? 'Update' : 'Add Plan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Design File Dialog */}
        <Dialog open={fileDialog} onOpenChange={setFileDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingFile ? 'Edit Design File' : 'Add Design File'}</DialogTitle>
              <DialogDescription>Upload 3D photos or elevation images via Google Drive</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>File Name *</Label>
                <Input value={fileForm.file_name} onChange={e => setFileForm({ ...fileForm, file_name: e.target.value })} placeholder="e.g. Front Elevation, 3D Render V1" className="mt-1" data-testid="file-name-input" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={fileForm.file_type} onValueChange={v => setFileForm({ ...fileForm, file_type: v })}>
                  <SelectTrigger className="mt-1" data-testid="file-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3d_photo">3D Photo</SelectItem>
                    <SelectItem value="elevation">Elevation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Google Drive Link</Label>
                <Input value={fileForm.drive_link} onChange={e => setFileForm({ ...fileForm, drive_link: e.target.value })} placeholder="https://drive.google.com/..." className="mt-1" data-testid="file-drive-link" />
              </div>
              <div>
                <Label>Remarks</Label>
                <Input value={fileForm.remarks} onChange={e => setFileForm({ ...fileForm, remarks: e.target.value })} placeholder="Any notes" className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFileDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveFile} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-file-btn">
                {editingFile ? 'Update' : 'Add File'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MobileBottomNav user={user} />
      </div>
    );
  }

  // ==================== MAIN: ALL PROJECTS VIEW ====================
  return (
    <div className="min-h-screen bg-gray-50" data-testid="architect-dashboard">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-600" />All Projects ({filteredProjects.length})
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                  <Input placeholder="Search..." value={projectSearch} onChange={e => setProjectSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="project-search" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="status-filter">
                    <Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="in_planning">In Planning</SelectItem>
                    <SelectItem value="pending_payment">Pending Payment</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="projects-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Type / Area</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Site Plans</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Design Files</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProjects.length === 0 ? (
                    <tr><td colSpan="7" className="p-8 text-center text-gray-400">No projects found</td></tr>
                  ) : filteredProjects.map(p => (
                    <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`project-row-${p.project_id}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.location || p.city || '-'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{p.client_name}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-500">{p.building_type || '-'}{p.total_area ? ` / ${p.total_area} sqft` : ''}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="font-medium">{p.site_plans_count}</span>
                        {p.pending_approval > 0 && <CountBadge count={p.pending_approval} />}
                      </td>
                      <td className="px-4 py-2.5 text-center font-medium">{p.design_files_count}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className="text-xs capitalize">{(p.status || '').replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openProjectDetail(p)} data-testid={`open-project-${p.project_id}`}>
                          <Eye className="h-3 w-3 mr-1" />Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
