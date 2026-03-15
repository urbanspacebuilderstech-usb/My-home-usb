import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Building2, LogOut, Package, Truck, Clock, CheckCircle, XCircle, 
  DollarSign, Plus, Trash2, Check, AlertCircle, History, Eye,
  ArrowRight, CreditCard, TrendingUp
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ProcurementDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [dashboard, setDashboard] = useState({});
  const [requests, setRequests] = useState([]);
  const [vendors, setVendors] = useState([]);
  
  // Pricing dialog state
  const [pricingDialog, setPricingDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [pricingDetails, setPricingDetails] = useState(null);
  const [newQuote, setNewQuote] = useState({
    vendor_id: '',
    vendor_name: '',
    unit_price: '',
    quantity: '',
    transport_cost: '0',
    discount: '0'
  });
  
  // New vendor dialog
  const [newVendorDialog, setNewVendorDialog] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    payment_terms: 'full'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, dashboardRes, vendorsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/procurement/dashboard`),
        axios.get(`${API}/vendor-master`)
      ]);
      
      const userData = userRes.data;
      if (!['procurement', 'super_admin'].includes(userData.role)) {
        toast.error('Access denied. Only Procurement can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userData);
      setDashboard(dashboardRes.data);
      setVendors(vendorsRes.data);
      fetchRequests('pending');
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API}/procurement/dashboard`);
      setDashboard(res.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    }
  };

  const fetchRequests = async (status) => {
    try {
      const res = await axios.get(`${API}/procurement/requests?status=${status}`);
      setRequests(res.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await axios.get(`${API}/vendor-master`);
      setVendors(res.data);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    fetchRequests(tab);
  };

  const handleStartPricing = async (request) => {
    try {
      // Check if pricing already exists
      if (request.pricing_id) {
        openPricingDialog(request.pricing_id);
        return;
      }
      
      const res = await axios.post(`${API}/procurement/start-pricing/${request.request_id}`);
      openPricingDialog(res.data.pricing_id);
      fetchDashboard();
      toast.success('Pricing started');
    } catch (error) {
      console.error('Error starting pricing:', error);
      toast.error('Failed to start pricing');
    }
  };

  const openPricingDialog = async (pricingId) => {
    try {
      const res = await axios.get(`${API}/procurement/pricing/${pricingId}`);
      setPricingDetails(res.data);
      setNewQuote({
        ...newQuote,
        quantity: res.data.pricing?.requested_qty?.toString() || ''
      });
      setPricingDialog(true);
    } catch (error) {
      console.error('Error fetching pricing details:', error);
      toast.error('Failed to load pricing details');
    }
  };

  const handleAddQuote = async () => {
    if (!pricingDetails || !newQuote.vendor_id || !newQuote.unit_price) {
      toast.error('Please select vendor and enter unit price');
      return;
    }
    
    const vendor = vendors.find(v => v.vendor_id === newQuote.vendor_id);
    
    try {
      await axios.post(`${API}/procurement/pricing/${pricingDetails.pricing.pricing_id}/add-quote`, {
        vendor_id: newQuote.vendor_id,
        vendor_name: vendor?.name || newQuote.vendor_name,
        unit_price: parseFloat(newQuote.unit_price),
        quantity: parseFloat(newQuote.quantity),
        transport_cost: parseFloat(newQuote.transport_cost || 0),
        discount: parseFloat(newQuote.discount || 0)
      });
      
      openPricingDialog(pricingDetails.pricing.pricing_id);
      setNewQuote({
        vendor_id: '',
        vendor_name: '',
        unit_price: '',
        quantity: pricingDetails.pricing?.requested_qty?.toString() || '',
        transport_cost: '0',
        discount: '0'
      });
      toast.success('Quote added');
    } catch (error) {
      console.error('Error adding quote:', error);
      toast.error('Failed to add quote');
    }
  };

  const handleSelectVendor = async (vendorId) => {
    if (!pricingDetails) return;
    
    try {
      await axios.patch(`${API}/procurement/pricing/${pricingDetails.pricing.pricing_id}/select-vendor?vendor_id=${vendorId}`);
      openPricingDialog(pricingDetails.pricing.pricing_id);
      toast.success('Vendor selected');
    } catch (error) {
      console.error('Error selecting vendor:', error);
      toast.error('Failed to select vendor');
    }
  };

  const handleSubmitForApproval = async () => {
    if (!pricingDetails || !pricingDetails.pricing.selected_vendor_id) {
      toast.error('Please select a vendor before submitting');
      return;
    }
    
    try {
      await axios.post(`${API}/procurement/pricing/${pricingDetails.pricing.pricing_id}/submit`);
      setPricingDialog(false);
      fetchDashboard();
      fetchRequests(activeTab);
      toast.success('Submitted for accounts approval');
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error('Failed to submit for approval');
    }
  };

  const handleAddNewVendor = async () => {
    if (!newVendor.name) {
      toast.error('Please enter vendor name');
      return;
    }
    
    try {
      const res = await axios.post(`${API}/procurement/add-vendor`, newVendor);
      setNewVendorDialog(false);
      fetchVendors();
      setNewQuote({ ...newQuote, vendor_id: res.data.vendor_id });
      setNewVendor({ name: '', contact_person: '', phone: '', email: '', payment_terms: 'full' });
      toast.success('Vendor added');
    } catch (error) {
      console.error('Error adding vendor:', error);
      toast.error(error.response?.data?.detail || 'Failed to add vendor');
    }
  };

  const handleRemoveQuote = async (quoteId) => {
    if (!pricingDetails) return;
    
    try {
      await axios.delete(`${API}/procurement/pricing/${pricingDetails.pricing.pricing_id}/quote/${quoteId}`);
      openPricingDialog(pricingDetails.pricing.pricing_id);
      toast.success('Quote removed');
    } catch (error) {
      console.error('Error removing quote:', error);
      toast.error('Failed to remove quote');
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
    if (!amount && amount !== 0) return '₹0';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pending', variant: 'secondary' },
      pricing_in_progress: { label: 'Pricing', variant: 'default' },
      waiting_accounts: { label: 'Waiting Accounts', variant: 'outline' },
      accounts_approved: { label: 'Approved', variant: 'default' },
      accounts_rejected: { label: 'Rejected', variant: 'destructive' },
      paid: { label: 'Paid', variant: 'default' },
      credit: { label: 'Credit', variant: 'secondary' },
      delivered_partial: { label: 'Partial Delivery', variant: 'outline' },
      delivered_completed: { label: 'Delivered', variant: 'default' }
    };
    const config = statusConfig[status] || { label: status, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 cursor-pointer active:bg-yellow-100" onClick={() => handleTabChange('pending')}>
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" />Pending
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-yellow-700">{dashboard.pending_requests || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 cursor-pointer active:bg-amber-50" onClick={() => handleTabChange('pricing_in_progress')}>
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />Pricing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-amber-700">{dashboard.pricing_in_progress || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 cursor-pointer active:bg-orange-100" onClick={() => handleTabChange('waiting_accounts')}>
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />Waiting
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-orange-700">{dashboard.waiting_accounts || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 cursor-pointer active:bg-green-100" onClick={() => handleTabChange('approved')}>
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />Approved
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-green-700">{dashboard.approved_orders || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 cursor-pointer active:bg-purple-100 col-span-2 sm:col-span-1" onClick={() => handleTabChange('delivered')}>
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <Package className="h-3 w-3 sm:h-4 sm:w-4" />Delivered
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-purple-700">{dashboard.delivered_orders || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="border-2 border-blue-200">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Value in Pricing</p>
                  <p className="text-base sm:text-xl font-bold text-amber-700">{formatCurrency(dashboard.total_in_pricing)}</p>
                </div>
                <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-blue-300" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-red-200">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Credit Outstanding</p>
                  <p className="text-base sm:text-xl font-bold text-red-700">{formatCurrency(dashboard.credit_outstanding)}</p>
                </div>
                <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-red-300" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200 col-span-2 lg:col-span-1">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-gray-600 mb-2">Top Vendors</p>
              <div className="space-y-1">
                {(dashboard.vendor_spend || []).slice(0, 3).map((v, i) => (
                  <div key={i} className="flex justify-between text-xs sm:text-sm">
                    <span className="truncate flex-1">{v.vendor}</span>
                    <span className="font-semibold text-green-700 ml-2">{formatCurrency(v.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-6">
              <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-1 sm:gap-2 w-full overflow-x-auto">
                <TabsTrigger value="pending" className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Pending
                </TabsTrigger>
                <TabsTrigger value="pricing_in_progress" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Pricing
                </TabsTrigger>
                <TabsTrigger value="waiting_accounts" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Waiting
                </TabsTrigger>
                <TabsTrigger value="approved" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Approved
                </TabsTrigger>
                <TabsTrigger value="delivered" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Delivered
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden divide-y divide-gray-200">
                {requests.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">No requests in this status</div>
                ) : (
                  requests.map((req) => (
                    <div key={req.request_id || req.pricing_id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{req.material_name}</p>
                          <p className="text-xs text-gray-500">{req.order_id}</p>
                        </div>
                        {getStatusBadge(req.status || req.procurement_status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div>
                          <span className="text-gray-500">Project:</span>
                          <span className="ml-1 font-medium">{req.project_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Qty:</span>
                          <span className="ml-1 font-medium">{req.requested_qty || req.quantity} {req.unit}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Engineer:</span>
                          <span className="ml-1 font-medium">{req.site_engineer_name}</span>
                        </div>
                        {req.final_amount > 0 && (
                          <div>
                            <span className="text-gray-500">Amount:</span>
                            <span className="ml-1 font-semibold text-green-600">{formatCurrency(req.final_amount)}</span>
                          </div>
                        )}
                      </div>
                      {(activeTab === 'pending' || activeTab === 'pricing_in_progress') && (
                        <Button 
                          size="sm" 
                          className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                          onClick={() => handleStartPricing(req)}
                        >
                          <DollarSign className="h-4 w-4" />
                          {activeTab === 'pending' ? 'Add Pricing' : 'Continue Pricing'}
                        </Button>
                      )}
                      {activeTab === 'waiting_accounts' && (
                        <Badge variant="outline" className="w-full justify-center py-2">
                          <Clock className="h-3 w-3 mr-1" /> Awaiting Accounts Approval
                        </Badge>
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Order ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Material</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Engineer</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                          No requests in this status
                        </td>
                      </tr>
                    ) : (
                      requests.map((req) => (
                        <tr key={req.request_id || req.pricing_id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm font-mono">{req.order_id}</td>
                          <td className="px-4 py-4 text-sm">{req.project_name}</td>
                          <td className="px-4 py-4">
                            <span className="font-medium">{req.material_name}</span>
                          </td>
                          <td className="px-4 py-4 text-sm">{req.requested_qty || req.quantity} {req.unit}</td>
                          <td className="px-4 py-4 text-sm">{req.site_engineer_name}</td>
                          <td className="px-4 py-4 text-right font-semibold text-green-600">
                            {req.final_amount ? formatCurrency(req.final_amount) : '-'}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {getStatusBadge(req.status || req.procurement_status)}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {(activeTab === 'pending' || activeTab === 'pricing_in_progress') && (
                              <Button 
                                size="sm" 
                                className="gap-1 bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleStartPricing(req)}
                              >
                                <DollarSign className="h-3 w-3" />
                                {activeTab === 'pending' ? 'Add Pricing' : 'Continue'}
                              </Button>
                            )}
                            {activeTab === 'waiting_accounts' && (
                              <Badge variant="outline">Waiting</Badge>
                            )}
                            {(activeTab === 'approved' || activeTab === 'delivered') && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => req.pricing_id && openPricingDialog(req.pricing_id)}
                              >
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

      {/* Pricing Dialog */}
      <Dialog open={pricingDialog} onOpenChange={setPricingDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Material Pricing</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">Compare vendors and select the best price</DialogDescription>
          </DialogHeader>

          {pricingDetails && (
            <div className="space-y-4 sm:space-y-6">
              {/* Request Details (Read-Only) */}
              <Card className="bg-gray-50">
                <CardHeader className="pb-2 p-3 sm:p-6">
                  <CardTitle className="text-sm">Request Details</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-500">Order ID:</span>
                      <p className="font-mono font-medium">{pricingDetails.original_request?.order_id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Project:</span>
                      <p className="font-medium">{pricingDetails.pricing?.project_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Material:</span>
                      <p className="font-medium">{pricingDetails.pricing?.material_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Quantity:</span>
                      <p className="font-medium">{pricingDetails.pricing?.requested_qty} {pricingDetails.pricing?.unit}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vendor Quotes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm sm:text-base">Vendor Quotes</h4>
                  {pricingDetails.pricing?.status === 'pricing_in_progress' && (
                    <Badge variant="outline">{pricingDetails.pricing?.vendor_quotes?.length || 0} quotes</Badge>
                  )}
                </div>

                {/* Existing Quotes */}
                <div className="space-y-2 mb-4">
                  {(pricingDetails.pricing?.vendor_quotes || []).map((quote) => (
                    <Card key={quote.quote_id} className={`${quote.is_selected ? 'border-2 border-green-500 bg-green-50' : ''}`}>
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{quote.vendor_name}</span>
                              {quote.is_selected && <Badge className="bg-green-600 text-xs">Selected</Badge>}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs sm:text-sm text-gray-600">
                              <span>Unit: ₹{quote.unit_price}</span>
                              <span>Qty: {quote.quantity}</span>
                              <span>Transport: ₹{quote.transport_cost}</span>
                              <span>Discount: ₹{quote.discount}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg sm:text-xl font-bold text-green-700">{formatCurrency(quote.total)}</span>
                            {pricingDetails.pricing?.status === 'pricing_in_progress' && (
                              <div className="flex gap-1">
                                {!quote.is_selected && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => handleSelectVendor(quote.vendor_id)}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-8 text-red-600"
                                  onClick={() => handleRemoveQuote(quote.quote_id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Add New Quote */}
                {pricingDetails.pricing?.status === 'pricing_in_progress' && (
                  <Card className="border-dashed">
                    <CardHeader className="pb-2 p-3 sm:p-6">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Add Vendor Quote
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label className="text-xs">Vendor</Label>
                          <div className="flex gap-2">
                            <Select value={newQuote.vendor_id} onValueChange={(v) => setNewQuote({...newQuote, vendor_id: v})}>
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select vendor" />
                              </SelectTrigger>
                              <SelectContent>
                                {vendors.map(v => (
                                  <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={() => setNewVendorDialog(true)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Unit Price (₹)</Label>
                          <Input 
                            type="number"
                            value={newQuote.unit_price}
                            onChange={(e) => setNewQuote({...newQuote, unit_price: e.target.value})}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Quantity</Label>
                          <Input 
                            type="number"
                            value={newQuote.quantity}
                            onChange={(e) => setNewQuote({...newQuote, quantity: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Transport (₹)</Label>
                          <Input 
                            type="number"
                            value={newQuote.transport_cost}
                            onChange={(e) => setNewQuote({...newQuote, transport_cost: e.target.value})}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Discount (₹)</Label>
                          <Input 
                            type="number"
                            value={newQuote.discount}
                            onChange={(e) => setNewQuote({...newQuote, discount: e.target.value})}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button onClick={handleAddQuote} className="w-full gap-2 bg-purple-600 hover:bg-purple-700">
                            <Plus className="h-4 w-4" /> Add Quote
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Price History */}
              {(pricingDetails.price_history || []).length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm sm:text-base mb-2 flex items-center gap-2">
                    <History className="h-4 w-4" /> Price History
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left">Vendor</th>
                          <th className="px-2 py-1 text-left">Project</th>
                          <th className="px-2 py-1 text-right">Unit Price</th>
                          <th className="px-2 py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricingDetails.price_history.map((h, i) => (
                          <tr key={i} className="border-b">
                            <td className="px-2 py-1">{h.vendor_name}</td>
                            <td className="px-2 py-1">{h.project_name}</td>
                            <td className="px-2 py-1 text-right">₹{h.unit_price}</td>
                            <td className="px-2 py-1 text-right font-medium">{formatCurrency(h.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              {pricingDetails.pricing?.status === 'pricing_in_progress' && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setPricingDialog(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmitForApproval}
                    disabled={!pricingDetails.pricing?.selected_vendor_id}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <ArrowRight className="h-4 w-4" /> Submit for Accounts Approval
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Vendor Dialog */}
      <Dialog open={newVendorDialog} onOpenChange={setNewVendorDialog}>
        <DialogContent className="max-w-md mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
            <DialogDescription>Quick add a vendor to the master list</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor Name *</Label>
              <Input 
                value={newVendor.name}
                onChange={(e) => setNewVendor({...newVendor, name: e.target.value})}
                placeholder="Enter vendor name"
              />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input 
                value={newVendor.contact_person}
                onChange={(e) => setNewVendor({...newVendor, contact_person: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input 
                  value={newVendor.phone}
                  onChange={(e) => setNewVendor({...newVendor, phone: e.target.value})}
                />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={newVendor.payment_terms} onValueChange={(v) => setNewVendor({...newVendor, payment_terms: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Payment</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVendorDialog(false)}>Cancel</Button>
            <Button onClick={handleAddNewVendor} className="bg-purple-600 hover:bg-purple-700">Add Vendor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
