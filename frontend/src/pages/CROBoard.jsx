import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Building2, LogOut, Plus, FileText, Clock, CheckCircle, Send,
  MapPin, Package, Eye, Users, ArrowRight, Filter, Calendar, DollarSign,
  Phone, Mail, Upload, Bell, CreditCard, Search, AlertCircle, CheckCircle2
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

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'credit_card', label: 'Credit Card' }
];

export default function CROBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [packages, setPackages] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('draft');
  const [projectStages, setProjectStages] = useState([]);
  const [stageCounts, setStageCounts] = useState({});
  
  // Filters
  const [filters, setFilters] = useState({
    status: '',
    stage: '',
    dateFrom: '',
    dateTo: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  
  const [createDialog, setCreateDialog] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [collectDialog, setCollectDialog] = useState(false);
  const [selectedPaymentStage, setSelectedPaymentStage] = useState(null);
  const [collectForm, setCollectForm] = useState({ amount: '', mode: 'bank_transfer', reference: '', remarks: '' });
  
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    client_phone: '',
    client_email: '',
    location: '',
    sqft: '',
    building_type: 'residential',
    expected_start_date: new Date().toISOString().split('T')[0],
    package_id: '',
    advance_date: new Date().toISOString().split('T')[0],
    advance_amount: '',
    advance_payment_mode: '',
    rough_estimate_url: ''
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
      setProjectStages(dashboardRes.data.project_stages || []);
      setStageCounts(dashboardRes.data.stage_counts || {});
      
      // Fetch payment requests for CRO
      try {
        const paymentReqRes = await axios.get(`${API}/cro/payment-requests`);
        setPaymentRequests(paymentReqRes.data);
      } catch (e) {
        console.log('Payment requests endpoint not available');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectsByStatus = async (statuses) => {
    try {
      const res = await axios.get(`${API}/cro/projects/all?status=${statuses}`);
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchFilteredProjects = async () => {
    try {
      let url = `${API}/cro/projects/all?`;
      if (filters.status) url += `status=${filters.status}&`;
      if (filters.stage && filters.stage !== 'all') url += `stage=${filters.stage}&`;
      if (filters.dateFrom) url += `date_from=${filters.dateFrom}&`;
      if (filters.dateTo) url += `date_to=${filters.dateTo}&`;
      
      const res = await axios.get(url);
      let filtered = res.data;
      
      // Client-side search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(p => 
          p.name?.toLowerCase().includes(search) ||
          p.client_name?.toLowerCase().includes(search) ||
          p.project_code?.toLowerCase().includes(search)
        );
      }
      
      setProjects(filtered);
    } catch (error) {
      console.error('Error fetching filtered projects:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'draft') {
      fetchProjectsByStatus('draft');
    } else if (tab === 'pending_payment') {
      fetchProjectsByStatus('pending_payment');
    } else if (tab === 'payment_received') {
      fetchProjectsByStatus('payment_verified');
    } else if (tab === 'in_planning') {
      fetchProjectsByStatus('planning_review,awaiting_approval');
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

    if (!form.advance_amount || parseFloat(form.advance_amount) <= 0) {
      toast.error('Advance payment amount is required');
      return;
    }

    try {
      const res = await axios.post(`${API}/cro/projects`, {
        ...form,
        sqft: parseFloat(form.sqft) || 0,
        advance_amount: parseFloat(form.advance_amount) || 0
      });
      toast.success(`Project created! ID: ${res.data.project_id}`);
      setCreateDialog(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project');
    }
  };

  const handleSubmitForPayment = async (projectId) => {
    try {
      await axios.patch(`${API}/cro/projects/${projectId}/submit`);
      toast.success('Project submitted for payment verification');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit project');
    }
  };

  const handleSubmitToPlanning = async (projectId) => {
    try {
      await axios.patch(`${API}/cro/projects/${projectId}/submit-to-planning`);
      toast.success('Project submitted to Planning Department');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit to Planning');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      client_name: '',
      client_phone: '',
      client_email: '',
      location: '',
      sqft: '',
      building_type: 'residential',
      expected_start_date: new Date().toISOString().split('T')[0],
      package_id: '',
      advance_date: new Date().toISOString().split('T')[0],
      advance_amount: '',
      advance_payment_mode: '',
      rough_estimate_url: ''
    });
    setSelectedPackage(null);
  };

  const openCollectDialog = (stage) => {
    setSelectedPaymentStage(stage);
    const balance = (stage.amount || 0) - (stage.amount_received || 0);
    setCollectForm({ amount: balance, mode: 'bank_transfer', reference: '', remarks: '' });
    setCollectDialog(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedPaymentStage || !collectForm.amount) {
      toast.error('Please enter amount');
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/${selectedPaymentStage.stage_id}/collect`, {
        amount_received: parseFloat(collectForm.amount),
        payment_mode: collectForm.mode,
        payment_reference: collectForm.reference || null,
        remarks: collectForm.remarks || null
      });
      toast.success('Payment collected successfully');
      setCollectDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to collect payment');
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
      draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
      pending_payment: { label: 'Payment Pending', className: 'bg-orange-100 text-orange-700' },
      payment_verified: { label: 'Payment Received', className: 'bg-emerald-100 text-emerald-700' },
      planning_review: { label: 'In Planning', className: 'bg-blue-100 text-blue-700' },
      awaiting_approval: { label: 'Awaiting Approval', className: 'bg-yellow-100 text-yellow-700' },
      gm_approved: { label: 'GM Approved', className: 'bg-purple-100 text-purple-700' },
      planning_approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
      active: { label: 'Active', className: 'bg-green-100 text-green-700' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
  };

  const getStageBadge = (stage) => {
    const stageInfo = projectStages.find(s => s.id === stage);
    return stageInfo ? stageInfo.name : stage || 'Yet to Start';
  };

  const getActionButton = (project) => {
    switch (project.status) {
      case 'draft':
        return (
          <Button size="sm" className="gap-1 bg-orange-500 hover:bg-orange-600" onClick={() => handleSubmitForPayment(project.project_id)} data-testid={`submit-payment-btn-${project.project_id}`}>
            <CreditCard className="h-3 w-3" /> Submit for Verification
          </Button>
        );
      case 'pending_payment':
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-300">
            <Clock className="h-3 w-3 mr-1" /> Awaiting Accountant
          </Badge>
        );
      case 'payment_verified':
        return (
          <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700" onClick={() => handleSubmitToPlanning(project.project_id)} data-testid={`submit-planning-btn-${project.project_id}`}>
            <Send className="h-3 w-3" /> Send to Planning
          </Button>
        );
      default:
        return (
          <Button size="sm" variant="outline" onClick={() => window.location.href = `/projects/${project.project_id}`} data-testid={`view-btn-${project.project_id}`}>
            <Eye className="h-3 w-3 mr-1" /> View
          </Button>
        );
    }
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
        {/* Dashboard Metrics Row 1 - Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-4">
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('draft')} data-testid="draft-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Draft</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{dashboard.draft_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('pending_payment')} data-testid="pending-payment-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-orange-600 mb-1">
                <CreditCard className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Pending Payment</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-orange-700">{dashboard.pending_payment_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('payment_received')} data-testid="payment-received-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-emerald-600 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Payment Received</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-700">{dashboard.payment_verified_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('in_planning')} data-testid="planning-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs sm:text-sm">In Planning</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{dashboard.planning_review_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('approved')} data-testid="approved-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Approved</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700">{dashboard.approved_count || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Workflow Info Banner */}
        <Card className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <Badge variant="outline" className="bg-gray-100">Draft</Badge>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <Badge variant="outline" className="bg-orange-100 text-orange-700">Submit for Payment</Badge>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <Badge variant="outline" className="bg-purple-100 text-purple-700">Accountant Verifies</Badge>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <Badge variant="outline" className="bg-emerald-100 text-emerald-700">Payment Received</Badge>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <Badge variant="outline" className="bg-blue-100 text-blue-700">Send to Planning</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Payment Requests from Planning */}
        {paymentRequests.length > 0 && (
          <Card className="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-purple-600" />
                Payment Collection Requests ({paymentRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {paymentRequests.map((req) => {
                  const balance = (req.amount || 0) - (req.amount_received || 0);
                  return (
                    <div key={req.stage_id} className="flex items-center justify-between bg-white p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{req.project_name}</p>
                        <p className="text-xs text-gray-500">{req.stage_name}</p>
                        <p className="text-sm font-semibold text-purple-600">₹{balance.toLocaleString()}</p>
                      </div>
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => openCollectDialog(req)}
                      >
                        <DollarSign className="h-3 w-3 mr-1" />
                        Collect
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Section - Total Ongoing & Value */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Ongoing Projects</p>
                  <p className="text-3xl font-bold text-blue-600">{dashboard.total_ongoing || 0}</p>
                </div>
                <Button variant="outline" onClick={() => window.location.href = '/projects'}>
                  View All Projects
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Project Value</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(dashboard.total_project_value)}</p>
                </div>
                <DollarSign className="h-10 w-10 text-green-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Project Stages Overview */}
        {projectStages.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Project Stages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {projectStages.map((stage) => (
                  <div 
                    key={stage.id}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => {
                      setFilters({ ...filters, stage: stage.id });
                      fetchFilteredProjects();
                    }}
                  >
                    <span className="text-sm font-medium">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs">{stageCounts[stage.id] || 0}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Projects Section */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">My Projects</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} data-testid="filter-btn">
              <Filter className="h-4 w-4 mr-1" /> Filters
            </Button>
            <Button onClick={() => setCreateDialog(true)} className="gap-2 bg-blue-600 hover:bg-blue-700" data-testid="create-project-btn">
              <Plus className="h-4 w-4" /> Create Project
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input 
                      placeholder="Project/Client..."
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      className="pl-8"
                      data-testid="filter-search"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Date From</Label>
                  <Input 
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    data-testid="filter-date-from"
                  />
                </div>
                <div>
                  <Label className="text-xs">Date To</Label>
                  <Input 
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    data-testid="filter-date-to"
                  />
                </div>
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select value={filters.stage || 'all'} onValueChange={(v) => setFilters({ ...filters, stage: v === 'all' ? '' : v })}>
                    <SelectTrigger data-testid="filter-stage">
                      <SelectValue placeholder="All Stages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {projectStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={fetchFilteredProjects} className="flex-1" data-testid="apply-filters-btn">Apply</Button>
                  <Button variant="outline" onClick={() => { setFilters({ status: '', stage: '', dateFrom: '', dateTo: '', search: '' }); fetchData(); }}>Clear</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Projects Table/Cards */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <TabsList className="bg-transparent p-0 flex-wrap">
                <TabsTrigger value="draft" className="data-[state=active]:border-b-2 data-[state=active]:border-gray-600 rounded-none text-xs sm:text-sm" data-testid="tab-draft">
                  Draft
                </TabsTrigger>
                <TabsTrigger value="pending_payment" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none text-xs sm:text-sm" data-testid="tab-pending-payment">
                  Pending Payment
                </TabsTrigger>
                <TabsTrigger value="payment_received" className="data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none text-xs sm:text-sm" data-testid="tab-payment-received">
                  Payment Received
                </TabsTrigger>
                <TabsTrigger value="in_planning" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none text-xs sm:text-sm" data-testid="tab-planning">
                  In Planning
                </TabsTrigger>
                <TabsTrigger value="approved" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none text-xs sm:text-sm" data-testid="tab-approved">
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
                    <div key={project.project_id} className="p-4" data-testid={`project-card-${project.project_id}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold">{project.name}</p>
                          <p className="text-xs text-gray-400">{project.project_code}</p>
                          <p className="text-sm text-gray-500">{project.client_name}</p>
                        </div>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div className="flex items-center gap-1 text-gray-500">
                          <MapPin className="h-3 w-3" /> {project.location || 'N/A'}
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                          <Package className="h-3 w-3" /> {project.package_name || 'N/A'}
                        </div>
                        <div>{project.sqft?.toLocaleString()} sqft</div>
                        <div className="font-semibold text-green-600">
                          {formatCurrency(project.total_value)}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        {getActionButton(project)}
                      </div>
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
                        <tr key={project.project_id} className="hover:bg-gray-50" data-testid={`project-row-${project.project_id}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-gray-400">{project.project_code}</p>
                          </td>
                          <td className="px-4 py-3">{project.client_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{project.location || '-'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{project.package_name || 'N/A'}</Badge>
                          </td>
                          <td className="px-4 py-3">{project.sqft?.toLocaleString()} sqft</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-600">
                            {formatCurrency(project.total_value)}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(project.status)}</td>
                          <td className="px-4 py-3 text-center">
                            {getActionButton(project)}
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
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Project Name *</Label>
                <Input 
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter project name"
                  data-testid="input-project-name"
                />
              </div>
              <div>
                <Label>Client Name *</Label>
                <Input 
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Enter client name"
                  data-testid="input-client-name"
                />
              </div>
            </div>

            {/* Client Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Client Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input 
                    value={form.client_phone}
                    onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="pl-10"
                    data-testid="input-client-phone"
                  />
                </div>
              </div>
              <div>
                <Label>Client Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input 
                    value={form.client_email}
                    onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                    placeholder="client@email.com"
                    className="pl-10"
                    data-testid="input-client-email"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Location</Label>
              <Input 
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Project location"
                data-testid="input-location"
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
                  data-testid="input-sqft"
                />
              </div>
              <div>
                <Label>Building Type</Label>
                <Select value={form.building_type} onValueChange={(v) => setForm({ ...form, building_type: v })}>
                  <SelectTrigger data-testid="select-building-type">
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
                  data-testid="input-start-date"
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
                    data-testid={`package-${pkg.code}`}
                  >
                    <CardContent className="p-4 text-center">
                      <Badge variant="outline" className="text-lg mb-2">{pkg.code}</Badge>
                      <p className="font-semibold">{pkg.name}</p>
                      {pkg.base_rate_per_sqft > 0 && (
                        <p className="text-xs text-gray-500 mt-1">{formatCurrency(pkg.base_rate_per_sqft)}/sqft</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Advance Payment Section - Required */}
            <Card className="bg-amber-50 border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Advance Payment Details *
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Date of Advance Received *</Label>
                    <Input 
                      type="date"
                      value={form.advance_date}
                      onChange={(e) => setForm({ ...form, advance_date: e.target.value })}
                      data-testid="input-advance-date"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Advance Amount *</Label>
                    <Input 
                      type="number"
                      value={form.advance_amount}
                      onChange={(e) => setForm({ ...form, advance_amount: e.target.value })}
                      placeholder="0"
                      data-testid="input-advance-amount"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Payment Mode *</Label>
                    <Select value={form.advance_payment_mode} onValueChange={(v) => setForm({ ...form, advance_payment_mode: v })}>
                      <SelectTrigger data-testid="select-payment-mode">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_MODES.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rough Estimate Upload */}
            <div>
              <Label>Rough Estimate (PDF URL)</Label>
              <div className="relative">
                <Upload className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input 
                  value={form.rough_estimate_url}
                  onChange={(e) => setForm({ ...form, rough_estimate_url: e.target.value })}
                  placeholder="https://... (PDF link)"
                  className="pl-10"
                  data-testid="input-estimate-url"
                />
              </div>
            </div>

            {/* Selected Package Details */}
            {selectedPackage && form.sqft && (
              <Card className="bg-gray-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Estimated Project Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">{form.sqft} sqft × {formatCurrency(selectedPackage.base_rate_per_sqft || 0)}/sqft</p>
                      <p className="text-sm text-gray-500">Package: {selectedPackage.name}</p>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(parseFloat(form.sqft) * (selectedPackage.base_rate_per_sqft || 0))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreateProject} className="bg-blue-600 hover:bg-blue-700" data-testid="btn-create-project">
              <Plus className="h-4 w-4 mr-2" /> Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
