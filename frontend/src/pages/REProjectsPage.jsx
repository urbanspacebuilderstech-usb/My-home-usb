import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Calculator, LogOut, Clock, RefreshCw, CheckCircle, XCircle, FileText,
  Building2, Send, Eye, Edit2, Plus, Trash2, Save, Phone, Mail, MapPin,
  ArrowLeft, Target
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RE_STATUS_CONFIG = {
  re_requested: { label: 'New Request', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Clock },
  re_in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: RefreshCw },
  re_submitted: { label: 'Submitted for Approval', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: FileText },
  re_approved: { label: 'Approved', color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle },
  re_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-300', icon: XCircle },
  deal_closed: { label: 'Deal Closed', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: Target },
  converted: { label: 'Converted to Project', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: Building2 }
};

export default function REProjectsPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('new');
  
  // Dialogs
  const [editDialog, setEditDialog] = useState(false);
  const [approvalDialog, setApprovalDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Edit Form
  const [editForm, setEditForm] = useState({
    project_name: '',
    location: '',
    sqft: '',
    building_type: '',
    rough_scope_items: [],
    handover_months: '',
    planning_notes: ''
  });
  
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/planning/re-dashboard`),
        axios.get(`${API}/crm/re-projects`)
      ]);
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const openEditDialog = (project) => {
    setSelectedProject(project);
    setEditForm({
      project_name: project.project_name || '',
      location: project.location || '',
      sqft: project.sqft || '',
      building_type: project.building_type || '',
      rough_scope_items: project.rough_scope_items || [],
      handover_months: project.handover_months || '',
      planning_notes: project.planning_notes || ''
    });
    setEditDialog(true);
  };

  const handleSaveProject = async () => {
    // Calculate total from scope items
    const scopeTotal = editForm.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0);
    
    try {
      await axios.patch(`${API}/crm/re-projects/${selectedProject.re_project_id}`, {
        ...editForm,
        sqft: editForm.sqft ? parseFloat(editForm.sqft) : null,
        handover_months: editForm.handover_months ? parseInt(editForm.handover_months) : null,
        estimated_total: scopeTotal
      });
      toast.success('RE Project updated');
      setEditDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update project');
    }
  };

  const handleSubmitForApproval = async (projectId) => {
    try {
      await axios.post(`${API}/crm/re-projects/${projectId}/submit-for-approval`);
      toast.success('Submitted for GM approval');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit');
    }
  };

  const handleApprove = async (approved) => {
    try {
      await axios.patch(`${API}/crm/re-projects/${selectedProject.re_project_id}/approve`, {
        approved,
        rejection_reason: approved ? null : rejectionReason
      });
      toast.success(approved ? 'RE Project approved' : 'RE Project rejected');
      setApprovalDialog(false);
      setRejectionReason('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process approval');
    }
  };

  const addScopeItem = () => {
    setEditForm({
      ...editForm,
      rough_scope_items: [...editForm.rough_scope_items, { name: '', quantity: 1, unit: 'nos', rate: 0, total: 0 }]
    });
  };

  const updateScopeItem = (index, field, value) => {
    const items = [...editForm.rough_scope_items];
    items[index][field] = value;
    if (field === 'quantity' || field === 'rate') {
      items[index].total = (items[index].quantity || 0) * (items[index].rate || 0);
    }
    setEditForm({ ...editForm, rough_scope_items: items });
  };

  const removeScopeItem = (index) => {
    const items = editForm.rough_scope_items.filter((_, i) => i !== index);
    setEditForm({ ...editForm, rough_scope_items: items });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getFilteredProjects = () => {
    switch (activeTab) {
      case 'new':
        return projects.filter(p => p.status === 're_requested');
      case 'in_progress':
        return projects.filter(p => p.status === 're_in_progress');
      case 'submitted':
        return projects.filter(p => p.status === 're_submitted');
      case 'approved':
        return projects.filter(p => ['re_approved', 'deal_closed', 'converted'].includes(p.status));
      case 'rejected':
        return projects.filter(p => p.status === 're_rejected');
      default:
        return projects;
    }
  };

  const canEdit = user?.role === 'planning' || user?.role === 'super_admin';
  const canApprove = user?.role === 'general_manager' || user?.role === 'super_admin';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/planning-board'}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-2.5 rounded-xl shadow-lg">
              <Calculator className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">RE Projects</h1>
              <p className="text-xs text-gray-500">Rough Estimate Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500 uppercase">{user?.role?.replace('_', ' ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'new' ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-1 text-blue-600" />
              <p className="text-2xl font-bold text-blue-700">{dashboard?.status_counts?.re_requested || 0}</p>
              <p className="text-xs text-blue-600">New Requests</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'in_progress' ? 'ring-2 ring-yellow-500' : ''}`}
            onClick={() => setActiveTab('in_progress')}
          >
            <CardContent className="p-4 text-center">
              <RefreshCw className="h-6 w-6 mx-auto mb-1 text-yellow-600" />
              <p className="text-2xl font-bold text-yellow-700">{dashboard?.status_counts?.re_in_progress || 0}</p>
              <p className="text-xs text-yellow-600">In Progress</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'submitted' ? 'ring-2 ring-purple-500' : ''}`}
            onClick={() => setActiveTab('submitted')}
          >
            <CardContent className="p-4 text-center">
              <FileText className="h-6 w-6 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold text-purple-700">{dashboard?.status_counts?.re_submitted || 0}</p>
              <p className="text-xs text-purple-600">Awaiting Approval</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'approved' ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => setActiveTab('approved')}
          >
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold text-green-700">{dashboard?.status_counts?.re_approved || 0}</p>
              <p className="text-xs text-green-600">Approved</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'rejected' ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            <CardContent className="p-4 text-center">
              <XCircle className="h-6 w-6 mx-auto mb-1 text-red-600" />
              <p className="text-2xl font-bold text-red-700">{dashboard?.status_counts?.re_rejected || 0}</p>
              <p className="text-xs text-red-600">Rejected</p>
            </CardContent>
          </Card>
        </div>

        {/* Projects List */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-purple-600" />
              RE Projects - {activeTab.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {getFilteredProjects().length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No projects in this category
                </div>
              ) : (
                getFilteredProjects().map(project => (
                  <div key={project.re_project_id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-gray-900">
                            {project.project_name || project.client_name}
                          </h4>
                          {RE_STATUS_CONFIG[project.status] && (
                            <Badge className={RE_STATUS_CONFIG[project.status].color}>
                              {RE_STATUS_CONFIG[project.status].label}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">Client:</span>
                            <p className="font-medium">{project.client_name}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Location:</span>
                            <p>{project.location || '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Size:</span>
                            <p>{project.sqft ? `${project.sqft} sqft` : '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Estimated Total:</span>
                            <p className="font-bold text-purple-600">{formatCurrency(project.estimated_total)}</p>
                          </div>
                        </div>
                        
                        {project.client_phone && (
                          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {project.client_phone}
                            {project.client_email && (
                              <>
                                <span className="mx-2">•</span>
                                <Mail className="h-3 w-3" /> {project.client_email}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        {canEdit && ['re_requested', 're_in_progress'].includes(project.status) && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openEditDialog(project)}
                            >
                              <Edit2 className="h-4 w-4 mr-1" /> Edit
                            </Button>
                            {project.status === 're_in_progress' && (
                              <Button 
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleSubmitForApproval(project.re_project_id)}
                              >
                                <Send className="h-4 w-4 mr-1" /> Submit
                              </Button>
                            )}
                          </>
                        )}
                        
                        {canApprove && project.status === 're_submitted' && (
                          <Button 
                            size="sm"
                            onClick={() => { setSelectedProject(project); setApprovalDialog(true); }}
                          >
                            Review
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditDialog(project)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit RE Project Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-purple-600" />
              {canEdit ? 'Edit' : 'View'} Rough Estimate
            </DialogTitle>
          </DialogHeader>
          
          {selectedProject && (
            <div className="space-y-6">
              {/* Client Info (Read-only) */}
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2 text-sm text-gray-600">Client Information</h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <p className="font-medium">{selectedProject.client_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p>{selectedProject.client_phone || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p>{selectedProject.client_email || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Project Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project Name</Label>
                  <Input
                    value={editForm.project_name}
                    onChange={(e) => setEditForm({...editForm, project_name: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Square Feet</Label>
                  <Input
                    type="number"
                    value={editForm.sqft}
                    onChange={(e) => setEditForm({...editForm, sqft: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Building Type</Label>
                  <Select 
                    value={editForm.building_type} 
                    onValueChange={(v) => setEditForm({...editForm, building_type: v})}
                    disabled={!canEdit}
                  >
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="villa">Villa</SelectItem>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Rough Scope Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Rough Scope of Work</Label>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={addScopeItem}>
                      <Plus className="h-4 w-4 mr-1" /> Add Item
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center w-20">Qty</th>
                        <th className="px-3 py-2 text-center w-20">Unit</th>
                        <th className="px-3 py-2 text-right w-24">Rate</th>
                        <th className="px-3 py-2 text-right w-24">Total</th>
                        {canEdit && <th className="px-3 py-2 w-12"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {editForm.rough_scope_items.length === 0 ? (
                        <tr>
                          <td colSpan={canEdit ? 6 : 5} className="px-3 py-4 text-center text-gray-500">
                            No scope items added
                          </td>
                        </tr>
                      ) : (
                        editForm.rough_scope_items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <Input
                                value={item.name}
                                onChange={(e) => updateScopeItem(idx, 'name', e.target.value)}
                                placeholder="Item description"
                                className="h-8"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateScopeItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                className="h-8 text-center"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={item.unit}
                                onChange={(e) => updateScopeItem(idx, 'unit', e.target.value)}
                                className="h-8 text-center"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                value={item.rate}
                                onChange={(e) => updateScopeItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                                className="h-8 text-right"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatCurrency(item.total)}
                            </td>
                            {canEdit && (
                              <td className="px-3 py-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => removeScopeItem(idx)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Cost Estimates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Estimated Material Cost</Label>
                  <Input
                    type="number"
                    value={editForm.estimated_material_cost}
                    onChange={(e) => setEditForm({...editForm, estimated_material_cost: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Estimated Labour Cost</Label>
                  <Input
                    type="number"
                    value={editForm.estimated_labour_cost}
                    onChange={(e) => setEditForm({...editForm, estimated_labour_cost: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Estimated Overhead</Label>
                  <Input
                    type="number"
                    value={editForm.estimated_overhead}
                    onChange={(e) => setEditForm({...editForm, estimated_overhead: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
              </div>
              
              {/* Total */}
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-600">Estimated Total</p>
                  <p className="text-3xl font-bold text-purple-800">
                    {formatCurrency(
                      (parseFloat(editForm.estimated_material_cost) || 0) +
                      (parseFloat(editForm.estimated_labour_cost) || 0) +
                      (parseFloat(editForm.estimated_overhead) || 0)
                    )}
                  </p>
                </CardContent>
              </Card>
              
              {/* Planning Notes */}
              <div>
                <Label>Planning Notes</Label>
                <Textarea
                  value={editForm.planning_notes}
                  onChange={(e) => setEditForm({...editForm, planning_notes: e.target.value})}
                  placeholder="Add notes for this rough estimate..."
                  rows={3}
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && ['re_requested', 're_in_progress'].includes(selectedProject?.status) && (
              <Button onClick={handleSaveProject} className="bg-purple-600 hover:bg-purple-700">
                <Save className="h-4 w-4 mr-1" /> Save Changes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalDialog} onOpenChange={setApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Rough Estimate</DialogTitle>
            <DialogDescription>
              Approve or reject this rough estimate submission
            </DialogDescription>
          </DialogHeader>
          
          {selectedProject && (
            <div className="space-y-4">
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedProject.project_name || selectedProject.client_name}</p>
                  <p className="text-sm text-gray-600">{selectedProject.location}</p>
                  <p className="text-2xl font-bold text-purple-700 mt-2">
                    {formatCurrency(selectedProject.estimated_total)}
                  </p>
                </CardContent>
              </Card>
              
              <div>
                <Label>Rejection Reason (if rejecting)</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Required if rejecting..."
                  rows={3}
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setApprovalDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={() => handleApprove(false)}
              disabled={!rejectionReason}
            >
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handleApprove(true)}
            >
              <CheckCircle className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
