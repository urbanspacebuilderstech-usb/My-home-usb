import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Building2, LogOut, Plus, FileText, Clock, CheckCircle, Send,
  MapPin, Package, Eye, Users, ArrowRight, Filter, Calendar, DollarSign,
  Phone, Mail, Upload, Bell, CreditCard, Search, AlertCircle, CheckCircle2, Target
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

export default function CREBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [packages, setPackages] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('new_deals');
  const [projectStages, setProjectStages] = useState([]);
  const [stageCounts, setStageCounts] = useState({});
  
  // New Deals from Sales (closed deals waiting for project creation)
  const [newDeals, setNewDeals] = useState([]);
  const [convertDealDialog, setConvertDealDialog] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [selectedDealRE, setSelectedDealRE] = useState(null);
  
  // Advance Collection for Deal Conversion
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMode, setAdvanceMode] = useState('');
  const [advanceRef, setAdvanceRef] = useState('');
  const [accountantConfirmed, setAccountantConfirmed] = useState(false);
  
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
        axios.get(`${API}/cre/dashboard`)
      ]);
      
      if (!['cre', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only CRE can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setPackages(dashboardRes.data.packages || []);
      setProjects(dashboardRes.data.recent_projects || []);
      setProjectStages(dashboardRes.data.project_stages || []);
      setStageCounts(dashboardRes.data.stage_counts || {});
      
      // Fetch new deals (closed deals from Sales)
      try {
        const dealsRes = await axios.get(`${API}/cre/new-deals`);
        setNewDeals(dealsRes.data || []);
      } catch (e) {
        console.log('New deals endpoint not available, trying alternative');
        // Try to get from sales leads with deal_closed status
        try {
          const salesRes = await axios.get(`${API}/crm/sales/leads?stage=deal_closed`);
          setNewDeals(salesRes.data?.filter(l => !l.project_created) || []);
        } catch (e2) {
          setNewDeals([]);
        }
      }
      
      // Fetch payment requests for CRE
      try {
        const paymentReqRes = await axios.get(`${API}/cre/payment-requests`);
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
  
  // Open deal conversion dialog
  const openConvertDealDialog = async (deal) => {
    setSelectedDeal(deal);
    setAdvanceAmount('');
    setAdvanceMode('');
    setAdvanceRef('');
    setAccountantConfirmed(false);
    
    // Fetch RE Project if available
    if (deal.re_project_id) {
      try {
        const reRes = await axios.get(`${API}/crm/re-projects/${deal.re_project_id}`);
        setSelectedDealRE(reRes.data);
      } catch (e) {
        setSelectedDealRE(null);
      }
    } else {
      setSelectedDealRE(null);
    }
    
    setConvertDealDialog(true);
  };
  
  // Convert deal to project
  const handleConvertDeal = async () => {
    if (!selectedDeal) return;
    
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
      toast.error('Please enter advance amount');
      return;
    }
    if (!advanceMode) {
      toast.error('Please select payment mode');
      return;
    }
    if (!accountantConfirmed) {
      toast.error('Please confirm accountant verification');
      return;
    }
    
    try {
      const result = await axios.post(`${API}/cre/convert-deal/${selectedDeal.lead_id}`, {
        advance_amount: parseFloat(advanceAmount),
        payment_mode: advanceMode,
        payment_reference: advanceRef,
        accountant_confirmed: accountantConfirmed
      });
      
      toast.success('Deal converted to project successfully!');
      setConvertDealDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to convert deal');
    }
  };

  const fetchProjectsByStatus = async (statuses) => {
    try {
      const res = await axios.get(`${API}/cre/projects/all?status=${statuses}`);
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchFilteredProjects = async () => {
    try {
      let url = `${API}/cre/projects/all?`;
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
      const res = await axios.post(`${API}/cre/projects`, {
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
      await axios.patch(`${API}/cre/projects/${projectId}/submit`);
      toast.success('Project submitted for payment verification');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit project');
    }
  };

  const handleSubmitToPlanning = async (projectId) => {
    try {
      await axios.patch(`${API}/cre/projects/${projectId}/submit-to-planning`);
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

  const openViewDialog = (project) => {
    setSelectedProject(project);
    setViewDialog(true);
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
      pending_payment: { label: 'Awaiting Accountant', className: 'bg-orange-100 text-orange-700' },
      payment_received: { label: 'Payment Verified', className: 'bg-emerald-100 text-emerald-700' },
      payment_verified: { label: 'Payment Verified', className: 'bg-emerald-100 text-emerald-700' },
      in_planning: { label: 'In Planning', className: 'bg-blue-100 text-blue-700' },
      planning_review: { label: 'In Planning', className: 'bg-blue-100 text-blue-700' },
      planning: { label: 'In Planning', className: 'bg-blue-100 text-blue-700' },
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
              <h1 className="text-lg sm:text-xl font-bold">CRE Board</h1>
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
                <p className="text-xs text-gray-500">CRE</p>
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
                <TabsTrigger value="new_deals" className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-600 rounded-none text-xs sm:text-sm" data-testid="tab-new-deals">
                  New Deals {newDeals.length > 0 && <span className="ml-1 bg-yellow-500 text-white text-xs px-1.5 rounded-full">{newDeals.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="all_projects" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none text-xs sm:text-sm" data-testid="tab-all-projects">
                  All Projects
                </TabsTrigger>
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
              {/* New Deals Tab Content */}
              <TabsContent value="new_deals" className="m-0">
                {newDeals.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No new deals waiting</p>
                    <p className="text-sm">Closed deals from Sales will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {newDeals.map((deal) => (
                      <div key={deal.lead_id} className="p-4 hover:bg-gray-50" data-testid={`deal-card-${deal.lead_id}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-lg">{deal.name}</h4>
                              <Badge className="bg-yellow-100 text-yellow-700">New Deal</Badge>
                              {deal.re_project_id && <Badge className="bg-blue-100 text-blue-700">Has RE</Badge>}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-2">
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {deal.phone || '-'}
                              </div>
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {deal.email || '-'}
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {deal.city || deal.re_project?.location || '-'}
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> {new Date(deal.updated_at || deal.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            {deal.re_project && (
                              <div className="bg-blue-50 p-2 rounded-lg mt-2">
                                <p className="text-sm font-medium text-blue-800">RE: {deal.re_project.project_name}</p>
                                <div className="flex gap-4 text-xs text-blue-600">
                                  <span>{deal.re_project.sqft?.toLocaleString()} sqft</span>
                                  <span>₹{(deal.re_project.estimated_total || 0).toLocaleString()}</span>
                                  <span>{deal.re_project.handover_months} months</span>
                                </div>
                              </div>
                            )}
                          </div>
                          <Button 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => openConvertDealDialog(deal)}
                            data-testid={`convert-deal-${deal.lead_id}`}
                          >
                            <ArrowRight className="h-4 w-4 mr-1" />
                            Convert to Project
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* All Projects Tab */}
              <TabsContent value="all_projects" className="m-0">
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
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left">Project</th>
                        <th className="px-4 py-3 text-left">Client</th>
                        <th className="px-4 py-3 text-left">Location</th>
                        <th className="px-4 py-3 text-center">Stage</th>
                        <th className="px-4 py-3 text-right">Value</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {projects.map((project) => (
                        <tr key={project.project_id} className="hover:bg-gray-50" data-testid={`project-row-${project.project_id}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-gray-400">{project.project_id}</p>
                          </td>
                          <td className="px-4 py-3">{project.client_name}</td>
                          <td className="px-4 py-3">{project.location || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline">{project.current_stage?.replace(/_/g, ' ') || '-'}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(project.total_value)}</td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(project.status)}</td>
                          <td className="px-4 py-3 text-center">
                            <Button size="sm" variant="outline" onClick={() => openViewDialog(project)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Draft/Other Status Tabs - Show same project list format */}
              <TabsContent value="draft" className="m-0">
                <div className="p-4 text-center text-gray-500">
                  {projects.length === 0 ? (
                    <div className="py-8">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No draft projects</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left">Project</th>
                            <th className="px-4 py-3 text-left">Client</th>
                            <th className="px-4 py-3 text-right">Value</th>
                            <th className="px-4 py-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {projects.map((project) => (
                            <tr key={project.project_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{project.name}</td>
                              <td className="px-4 py-3">{project.client_name}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatCurrency(project.total_value)}</td>
                              <td className="px-4 py-3 text-center">{getActionButton(project)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="pending_payment" className="m-0">
                <div className="p-4">
                  {projects.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <CreditCard className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No pending payments</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <div key={project.project_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-sm text-gray-500">{project.client_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-orange-600">{formatCurrency(project.total_value)}</p>
                            <Badge className="bg-orange-100 text-orange-700">Awaiting Accountant</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="payment_received" className="m-0">
                <div className="p-4">
                  {projects.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No verified payments</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <div key={project.project_id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-sm text-gray-500">{project.client_name}</p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <p className="font-bold text-emerald-600">{formatCurrency(project.total_value)}</p>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSubmitToPlanning(project.project_id)}>
                              <Send className="h-3 w-3 mr-1" /> Send to Planning
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="in_planning" className="m-0">
                <div className="p-4">
                  {projects.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No projects in planning</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <div key={project.project_id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-sm text-gray-500">{project.client_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-blue-600">{formatCurrency(project.total_value)}</p>
                            <Badge className="bg-blue-100 text-blue-700">In Planning</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="approved" className="m-0">
                <div className="p-4">
                  {projects.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No approved projects</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <div key={project.project_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-sm text-gray-500">{project.client_name}</p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <p className="font-bold text-green-600">{formatCurrency(project.total_value)}</p>
                            <Button size="sm" variant="outline" onClick={() => window.location.href = `/projects/${project.project_id}`}>
                              <Eye className="h-3 w-3 mr-1" /> View
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
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

      {/* Collect Payment Dialog */}
      <Dialog open={collectDialog} onOpenChange={setCollectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Collect Payment
            </DialogTitle>
            <DialogDescription>
              {selectedPaymentStage?.project_name} - {selectedPaymentStage?.stage_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Stage Amount</p>
                <p className="font-semibold">₹{(selectedPaymentStage?.amount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Already Received</p>
                <p className="font-semibold text-green-600">₹{(selectedPaymentStage?.amount_received || 0).toLocaleString()}</p>
              </div>
            </div>
            
            <div>
              <Label>Amount to Collect *</Label>
              <Input
                type="number"
                value={collectForm.amount}
                onChange={(e) => setCollectForm({...collectForm, amount: e.target.value})}
                placeholder="Enter amount"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Payment Mode *</Label>
              <select
                value={collectForm.mode}
                onChange={(e) => setCollectForm({...collectForm, mode: e.target.value})}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            
            <div>
              <Label>Reference / Transaction ID</Label>
              <Input
                value={collectForm.reference}
                onChange={(e) => setCollectForm({...collectForm, reference: e.target.value})}
                placeholder="Transaction ID or Cheque No."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Input
                value={collectForm.remarks}
                onChange={(e) => setCollectForm({...collectForm, remarks: e.target.value})}
                placeholder="Optional remarks"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectDialog(false)}>Cancel</Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert Deal to Project Dialog */}
      <Dialog open={convertDealDialog} onOpenChange={setConvertDealDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Target className="h-5 w-5" />
              Convert Deal to Project
            </DialogTitle>
            <DialogDescription>
              Collect advance and convert this deal to a project
            </DialogDescription>
          </DialogHeader>
          
          {selectedDeal && (
            <div className="space-y-4">
              {/* Deal Summary */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-800 text-lg mb-2">{selectedDeal.name}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-gray-500" />
                    <span>{selectedDeal.phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-gray-500" />
                    <span>{selectedDeal.email || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-gray-500" />
                    <span>{selectedDeal.city || selectedDealRE?.location || '-'}</span>
                  </div>
                </div>
                
                {selectedDealRE && (
                  <div className="mt-3 pt-3 border-t border-green-300">
                    <p className="text-sm font-medium text-green-700 mb-1">Rough Estimate Details:</p>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-green-600">
                        <span>{selectedDealRE.sqft?.toLocaleString()} sqft</span>
                        <span className="mx-2">•</span>
                        <span>{selectedDealRE.handover_months || 12} months</span>
                      </div>
                      <span className="text-xl font-bold text-green-700">
                        ₹{(selectedDealRE.estimated_total || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Advance Payment Details */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">
                    Advance Amount <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-2.5 text-gray-500">₹</span>
                    <Input
                      type="number"
                      placeholder="Enter advance amount"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      className="pl-8"
                      data-testid="advance-amount-input"
                    />
                  </div>
                  {advanceAmount && selectedDealRE?.estimated_total && (
                    <p className="text-xs text-gray-500 mt-1">
                      {((parseFloat(advanceAmount) / selectedDealRE.estimated_total) * 100).toFixed(1)}% of total value
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium">
                    Payment Mode <span className="text-red-500">*</span>
                  </Label>
                  <Select value={advanceMode} onValueChange={setAdvanceMode}>
                    <SelectTrigger className="mt-1" data-testid="payment-mode-select">
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer / NEFT / RTGS</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="card">Debit/Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">Payment Reference / Transaction ID</Label>
                  <Input
                    placeholder="e.g., UPI Ref, Cheque No., Transaction ID"
                    value={advanceRef}
                    onChange={(e) => setAdvanceRef(e.target.value)}
                    className="mt-1"
                    data-testid="payment-ref-input"
                  />
                </div>
              </div>

              {/* Balance Summary */}
              {advanceAmount && parseFloat(advanceAmount) > 0 && selectedDealRE?.estimated_total && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Balance After Advance</span>
                    <span className="font-semibold text-blue-800">
                      ₹{(selectedDealRE.estimated_total - parseFloat(advanceAmount)).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Accountant Confirmation */}
              <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountantConfirmed}
                    onChange={(e) => setAccountantConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded border-orange-300"
                  />
                  <span className="text-sm text-orange-800">
                    <strong>Accountant Verification:</strong> I confirm the payment has been received and verified by accounts
                  </span>
                </label>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConvertDealDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConvertDeal}
              className="bg-green-600 hover:bg-green-700"
              disabled={!advanceAmount || parseFloat(advanceAmount) <= 0 || !advanceMode || !accountantConfirmed}
              data-testid="confirm-convert-deal"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Convert to Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Project Dialog */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              Project Details
            </DialogTitle>
            <DialogDescription>
              {selectedProject?.project_code}
            </DialogDescription>
          </DialogHeader>
          
          {selectedProject && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg mb-2">{selectedProject.name}</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Client:</span>
                    <p className="font-medium">{selectedProject.client_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Location:</span>
                    <p>{selectedProject.location || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Package:</span>
                    <p>{selectedProject.package_name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Area:</span>
                    <p>{selectedProject.sqft?.toLocaleString()} sqft</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <p>{getStatusBadge(selectedProject.status)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Value:</span>
                    <p className="font-bold text-green-600">{formatCurrency(selectedProject.total_value)}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  className="flex-1"
                  onClick={() => window.location.href = `/projects/${selectedProject.project_id}`}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Details
                </Button>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
