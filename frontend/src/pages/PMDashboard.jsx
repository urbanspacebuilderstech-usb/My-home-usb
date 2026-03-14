import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, Users, Package, ClipboardList, CheckCircle, XCircle, Clock,
  UserPlus, Eye, ChevronRight, AlertCircle, Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PMDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [projects, setProjects] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [labourRequests, setLabourRequests] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Dialogs
  const [assignTeamDialog, setAssignTeamDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedMember, setSelectedMember] = useState('');
  const [approvalDialog, setApprovalDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestType, setRequestType] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashRes, projRes, matRes, labRes, teamRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/pm/dashboard`),
        axios.get(`${API}/pm/projects`),
        axios.get(`${API}/pm/material-requests`),
        axios.get(`${API}/pm/labour-requests`),
        axios.get(`${API}/pm/team-members`)
      ]);
      
      if (!['project_manager', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashRes.data);
      setProjects(projRes.data);
      setMaterialRequests(matRes.data);
      setLabourRequests(labRes.data);
      setTeamMembers(teamRes.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTeam = async () => {
    if (!selectedMember || !selectedProject) {
      toast.error('Please select a team member');
      return;
    }
    try {
      await axios.post(`${API}/pm/assign-team`, {
        project_id: selectedProject.project_id,
        user_id: selectedMember,
        role: teamMembers.find(m => m.user_id === selectedMember)?.role || 'site_engineer'
      });
      toast.success('Team member assigned');
      setAssignTeamDialog(false);
      setSelectedMember('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign team member');
    }
  };

  const handleApproveRequest = async (action, req = null, type = null) => {
    const request = req || selectedRequest;
    const rType = type || requestType;
    if (!request) return;
    
    try {
      if (rType === 'material') {
        await axios.patch(`${API}/site-engineer/material-requests/${request.request_id}/approve`, null, {
          params: { 
            action: action === 'approve' ? 'pm_approve' : 'reject',
            rejection_reason: action === 'reject' ? rejectReason : undefined
          }
        });
      } else if (rType === 'labour') {
        const labId = request.labour_expense_id || request.request_id;
        await axios.patch(`${API}/pm/labour-requests/${labId}/verify`, null, {
          params: { action, rejection_reason: action === 'reject' ? rejectReason : undefined }
        });
      }
      toast.success(`Request ${action === 'approve' ? 'approved' : 'rejected'}`);
      setApprovalDialog(false);
      setRejectReason('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process request');
    }
  };

  const getRoleBadge = (role) => {
    const config = {
      associate_pm: { label: 'Associate PM', className: 'bg-purple-100 text-purple-700' },
      sr_site_engineer: { label: 'Sr. Site Engineer', className: 'bg-amber-50 text-amber-700' },
      site_engineer: { label: 'Site Engineer', className: 'bg-orange-100 text-orange-700' }
    };
    const c = config[role] || { label: role, className: 'bg-gray-100' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-amber-50 border-blue-200">
            <CardContent className="p-4">
              <Building2 className="h-6 w-6 text-amber-600 mb-2" />
              <p className="text-2xl font-bold text-amber-700">{dashboard.total_projects}</p>
              <p className="text-sm text-amber-600">Total Projects</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <CheckCircle className="h-6 w-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-700">{dashboard.active_projects}</p>
              <p className="text-sm text-green-600">Active</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="p-4">
              <Package className="h-6 w-6 text-orange-600 mb-2" />
              <p className="text-2xl font-bold text-orange-700">{dashboard.pending_material_requests}</p>
              <p className="text-sm text-orange-600">Material Requests</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <ClipboardList className="h-6 w-6 text-purple-600 mb-2" />
              <p className="text-2xl font-bold text-purple-700">{dashboard.pending_labour_requests}</p>
              <p className="text-sm text-purple-600">Labour Requests</p>
            </CardContent>
          </Card>
          <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="p-4">
              <Users className="h-6 w-6 text-indigo-600 mb-2" />
              <p className="text-2xl font-bold text-indigo-700">{dashboard.team_members}</p>
              <p className="text-sm text-indigo-600">Team Members</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Approvals Alert */}
        {(dashboard.pending_material_requests > 0 || dashboard.pending_labour_requests > 0) && (
          <Card className="bg-yellow-50 border-yellow-200 mb-6">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
                <div>
                  <p className="font-semibold text-yellow-800">Pending Approvals</p>
                  <p className="text-sm text-yellow-600">
                    {dashboard.pending_material_requests} material requests, {dashboard.pending_labour_requests} labour requests
                  </p>
                </div>
              </div>
              <Button onClick={() => setActiveTab('requests')}>Review Now</Button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              {(dashboard.pending_material_requests + dashboard.pending_labour_requests) > 0 && (
                <Badge className="ml-2 bg-red-500">{dashboard.pending_material_requests + dashboard.pending_labour_requests}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Recent Material Requests */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" /> Pending Material Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {materialRequests.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No pending requests</p>
                  ) : (
                    <div className="space-y-3">
                      {materialRequests.slice(0, 5).map(req => (
                        <div key={req.request_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{req.material_name}</p>
                            <p className="text-sm text-gray-500">{req.project_name}</p>
                          </div>
                          <Button 
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(req);
                              setRequestType('material');
                              setApprovalDialog(true);
                            }}
                          >
                            Review
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Team Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> Team Members
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {teamMembers.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No team members</p>
                  ) : (
                    <div className="space-y-3">
                      {teamMembers.slice(0, 5).map(member => (
                        <div key={member.user_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-gray-500">{member.active_projects} active projects</p>
                          </div>
                          {getRoleBadge(member.role)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-4">
            <div className="space-y-4">
              {projects.map(project => (
                <Card key={project.project_id} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{project.name}</h3>
                          <Badge>{project.status}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{project.client_name} • {project.location}</p>
                        
                        {/* Team */}
                        {project.team && project.team.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {project.team.map(t => (
                              <Badge key={t.user_id} variant="outline" className="text-xs">
                                {t.name} ({t.role.replace('_', ' ')})
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedProject(project);
                            setAssignTeamDialog(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-1" /> Assign Team
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => window.location.href = `/projects/${project.project_id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="mt-4">
            <div className="space-y-6">
              {/* Material Requests */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5" /> Material Requests ({materialRequests.length})
                </h3>
                {materialRequests.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-gray-500">No pending material requests</CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {materialRequests.map(req => (
                      <Card key={req.request_id} className="border-l-4 border-l-orange-500">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold">{req.material_name}</p>
                              <p className="text-sm text-gray-500">
                                Qty: {req.quantity} {req.unit} • {req.project_name}
                              </p>
                              <p className="text-xs text-gray-400">Requested by: {req.requester_name}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                data-testid={`approve-material-${req.request_id}`}
                                onClick={() => handleApproveRequest('approve', req, 'material')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button 
                                size="sm"
                                variant="destructive"
                                data-testid={`reject-material-${req.request_id}`}
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setRequestType('material');
                                  setApprovalDialog(true);
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Labour Requests */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> Labour Requests ({labourRequests.length})
                </h3>
                {labourRequests.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-gray-500">No pending labour requests</CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {labourRequests.map(req => (
                      <Card key={req.labour_expense_id} className="border-l-4 border-l-purple-500">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold">{req.description || 'Labour Payment'}</p>
                              <p className="text-sm text-gray-500">
                                ₹{req.amount?.toLocaleString()} • {req.project_name}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                data-testid={`verify-labour-${req.labour_expense_id}`}
                                onClick={() => handleApproveRequest('approve', req, 'labour')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" /> Verify
                              </Button>
                              <Button 
                                size="sm"
                                variant="destructive"
                                data-testid={`reject-labour-${req.labour_expense_id}`}
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setRequestType('labour');
                                  setApprovalDialog(true);
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="mt-4">
            <div className="space-y-4">
              {teamMembers.map(member => (
                <Card key={member.user_id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-lg">{member.name}</p>
                          {getRoleBadge(member.role)}
                        </div>
                        <p className="text-sm text-gray-500">{member.email}</p>
                        <p className="text-sm text-gray-500">{member.phone}</p>
                        
                        {/* Assigned Projects */}
                        {member.assignments && member.assignments.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-gray-500 mb-1">Assigned Projects:</p>
                            <div className="flex flex-wrap gap-1">
                              {member.assignments.map(a => (
                                <Badge key={a.assignment_id} variant="outline" className="text-xs">
                                  {a.project_name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-amber-600">{member.active_projects}</p>
                        <p className="text-sm text-gray-500">Active Projects</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Assign Team Dialog */}
      <Dialog open={assignTeamDialog} onOpenChange={setAssignTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Team Member</DialogTitle>
            <DialogDescription>
              Assign a team member to {selectedProject?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name} ({member.role.replace('_', ' ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTeamDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignTeam}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval/Rejection Dialog */}
      <Dialog open={approvalDialog} onOpenChange={setApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Textarea 
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleApproveRequest('reject')}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
