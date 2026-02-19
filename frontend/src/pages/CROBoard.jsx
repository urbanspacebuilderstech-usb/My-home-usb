import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Building2, LogOut, Plus, FileText, Clock, CheckCircle, Send,
  MapPin, Package, Eye, Users, ArrowRight
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BUILDING_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'villa', label: 'Villa' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'office', label: 'Office' }
];

export default function CROBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [packages, setPackages] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('draft');
  
  const [createDialog, setCreateDialog] = useState(false);
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    location: '',
    sqft: '',
    building_type: 'residential',
    expected_start_date: new Date().toISOString().split('T')[0],
    package_id: ''
  });
  
  const [selectedPackage, setSelectedPackage] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/cro/dashboard`)
      ]);
      
      if (!['cro', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only CRO can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setPackages(dashboardRes.data.packages || []);
      setProjects(dashboardRes.data.recent_projects || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectsByStatus = async (status) => {
    try {
      const res = await axios.get(`${API}/projects?status=${status}`);
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'draft') {
      fetchProjectsByStatus('draft');
    } else if (tab === 'review') {
      fetchProjectsByStatus('planning_review');
    } else if (tab === 'approved') {
      fetchProjectsByStatus('planning_approved,active');
    }
  };

  const handlePackageSelect = async (packageId) => {
    setForm({ ...form, package_id: packageId });
    try {
      const res = await axios.get(`${API}/packages/${packageId}`);
      setSelectedPackage(res.data);
    } catch (error) {
      console.error('Error fetching package:', error);
    }
  };

  const handleCreateProject = async () => {
    if (!form.name || !form.client_name || !form.package_id) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      const res = await axios.post(`${API}/cro/projects`, {
        ...form,
        sqft: parseFloat(form.sqft) || 0
      });
      toast.success(`Project created! Value: ₹${res.data.total_value.toLocaleString('en-IN')}`);
      setCreateDialog(false);
      setForm({
        name: '',
        client_name: '',
        location: '',
        sqft: '',
        building_type: 'residential',
        expected_start_date: new Date().toISOString().split('T')[0],
        package_id: ''
      });
      setSelectedPackage(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project');
    }
  };

  const handleSubmitProject = async (projectId) => {
    try {
      await axios.patch(`${API}/cro/projects/${projectId}/submit`);
      toast.success('Project submitted for planning review');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit project');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (error) {
      console.error('Logout error:', error);
    }
    window.location.href = '/login';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: 'Draft', variant: 'secondary' },
      planning_review: { label: 'In Review', variant: 'default' },
      awaiting_approval: { label: 'Awaiting Approval', variant: 'outline' },
      gm_approved: { label: 'GM Approved', variant: 'default' },
      planning_approved: { label: 'Approved', variant: 'default' },
      active: { label: 'Active', variant: 'default' }
    };
    const c = config[status] || { label: status, variant: 'secondary' };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold">CRO Board</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Client Relationship & Project Onboarding</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500">CRO</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 cursor-pointer" onClick={() => handleTabChange('draft')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Draft</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{dashboard.draft_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer" onClick={() => handleTabChange('review')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs sm:text-sm">In Review</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{dashboard.planning_review_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-yellow-600 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Awaiting</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-yellow-700">{dashboard.awaiting_approval_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 cursor-pointer" onClick={() => handleTabChange('approved')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Approved</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700">{dashboard.approved_count || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Create Project Button */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">My Projects</h2>
          <Button onClick={() => setCreateDialog(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Create Project
          </Button>
        </div>

        {/* Projects Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <TabsList className="bg-transparent p-0">
                <TabsTrigger value="draft" className="data-[state=active]:border-b-2 data-[state=active]:border-gray-600 rounded-none">
                  Draft
                </TabsTrigger>
                <TabsTrigger value="review" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none">
                  In Review
                </TabsTrigger>
                <TabsTrigger value="approved" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none">
                  Approved
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden divide-y">
                {projects.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No projects found</div>
                ) : (
                  projects.map((project) => (
                    <div key={project.project_id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold">{project.name}</p>
                          <p className="text-sm text-gray-500">{project.client_name}</p>
                        </div>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div className="flex items-center gap-1 text-gray-500">
                          <MapPin className="h-3 w-3" /> {project.location}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <Package className="h-3 w-3" /> {project.package_name || 'N/A'}
                        </div>
                        <div className="col-span-2 font-semibold text-green-600">
                          {formatCurrency(project.total_value)}
                        </div>
                      </div>
                      {project.status === 'draft' && (
                        <Button size="sm" className="w-full gap-2" onClick={() => handleSubmitProject(project.project_id)}>
                          <Send className="h-3 w-3" /> Submit for Review
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CLIENT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">LOCATION</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PACKAGE</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">SQFT</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">VALUE</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {projects.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center text-gray-500">No projects found</td>
                      </tr>
                    ) : (
                      projects.map((project) => (
                        <tr key={project.project_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{project.name}</td>
                          <td className="px-4 py-3">{project.client_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{project.location}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{project.package_name || 'N/A'}</Badge>
                          </td>
                          <td className="px-4 py-3">{project.sqft?.toLocaleString()} sqft</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-600">
                            {formatCurrency(project.total_value)}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(project.status)}</td>
                          <td className="px-4 py-3 text-center">
                            {project.status === 'draft' ? (
                              <Button size="sm" className="gap-1" onClick={() => handleSubmitProject(project.project_id)}>
                                <Send className="h-3 w-3" /> Submit
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => window.location.href = `/projects/${project.project_id}`}>
                                <Eye className="h-3 w-3 mr-1" /> View
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Project Name *</Label>
                <Input 
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter project name"
                />
              </div>
              <div>
                <Label>Client Name *</Label>
                <Input 
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Enter client name"
                />
              </div>
            </div>

            <div>
              <Label>Location</Label>
              <Input 
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Project location"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Square Feet</Label>
                <Input 
                  type="number"
                  value={form.sqft}
                  onChange={(e) => setForm({ ...form, sqft: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Building Type</Label>
                <Select value={form.building_type} onValueChange={(v) => setForm({ ...form, building_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUILDING_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Start Date</Label>
                <Input 
                  type="date"
                  value={form.expected_start_date}
                  onChange={(e) => setForm({ ...form, expected_start_date: e.target.value })}
                />
              </div>
            </div>

            {/* Package Selection */}
            <div>
              <Label>Select Package *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {packages.map((pkg) => (
                  <Card 
                    key={pkg.package_id}
                    className={`cursor-pointer transition-all ${form.package_id === pkg.package_id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'}`}
                    onClick={() => handlePackageSelect(pkg.package_id)}
                  >
                    <CardContent className="p-4 text-center">
                      <Badge variant="outline" className="text-lg mb-2">{pkg.code}</Badge>
                      <p className="font-semibold">{pkg.name}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Selected Package Details */}
            {selectedPackage && (
              <Card className="bg-gray-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Package Details - {selectedPackage.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-gray-500">Scope Items</p>
                      <p className="font-semibold">{selectedPackage.scope_items?.length || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Materials</p>
                      <p className="font-semibold">{selectedPackage.material_items?.length || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Labour Items</p>
                      <p className="font-semibold">{selectedPackage.labour_items?.length || 0}</p>
                    </div>
                  </div>
                  {selectedPackage.base_rate_per_sqft > 0 && form.sqft && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-gray-500">Estimated Value</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(parseFloat(form.sqft) * selectedPackage.base_rate_per_sqft)}
                      </p>
                      <p className="text-xs text-gray-400">{form.sqft} sqft × {formatCurrency(selectedPackage.base_rate_per_sqft)}/sqft</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" /> Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
