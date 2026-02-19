import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Wallet, LogOut, Package, Users, Truck, DollarSign, 
  CreditCard, CheckCircle, Clock, Eye, Building2
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AccountsBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [pendingPayments, setPendingPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'full',
    amount: '',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, paymentsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accounts/dashboard`),
        axios.get(`${API}/accounts/pending-payments`)
      ]);
      
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only Accounts can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setPendingPayments(paymentsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (type) => {
    try {
      const res = await axios.get(`${API}/accounts/pending-payments${type !== 'all' ? `?payment_type=${type}` : ''}`);
      setPendingPayments(res.data);
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    fetchPayments(tab);
  };

  const openPaymentDialog = (item) => {
    setSelectedItem(item);
    setPaymentForm({
      payment_type: 'full',
      amount: item.final_amount || item.total_amount || item.estimated_cost || 0,
      remarks: ''
    });
    setPaymentDialog(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedItem) return;

    try {
      // Handle stage payments differently
      if (selectedItem.payment_type === 'stage') {
        await axios.patch(
          `${API}/work-orders/${selectedItem.work_order_id}/stages/${selectedItem.stage_id}/process-payment`
        );
        toast.success('Stage payment processed');
      } else {
        const itemId = selectedItem.pricing_id || selectedItem.expense_id || selectedItem.request_id;
        
        await axios.patch(`${API}/accounts/process-payment/${selectedItem.payment_type}/${itemId}`, {
          payment_type: paymentForm.payment_type,
          amount: paymentForm.payment_type === 'partial' ? parseFloat(paymentForm.amount) : null,
          remarks: paymentForm.remarks
        });
        
        toast.success(`Payment processed as ${paymentForm.payment_type}`);
      }
      
      setPaymentDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process payment');
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

  const getTypeIcon = (type) => {
    switch (type) {
      case 'material': return <Package className="h-4 w-4" />;
      case 'labour': return <Users className="h-4 w-4" />;
      case 'procurement': return <Truck className="h-4 w-4" />;
      case 'stage': return <CheckCircle className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type) => {
    const config = {
      material: { label: 'Material', color: 'bg-blue-100 text-blue-700' },
      labour: { label: 'Labour', color: 'bg-green-100 text-green-700' },
      procurement: { label: 'Procurement', color: 'bg-purple-100 text-purple-700' },
      stage: { label: 'Stage Payment', color: 'bg-orange-100 text-orange-700' }
    };
    const c = config[type] || { label: type, color: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${c.color}`}>{c.label}</span>;
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
            <div className="bg-emerald-600 p-2 rounded-lg">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold">Accounts Board</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Payment Processing & Financial Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/income'}>
              Income
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500">ACCOUNTS</p>
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
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer" onClick={() => handleTabChange('material')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Package className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Material</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{dashboard.pending_material || 0}</p>
              <p className="text-xs text-blue-600">{formatCurrency(dashboard.material_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 cursor-pointer" onClick={() => handleTabChange('labour')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Labour</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700">{dashboard.pending_labour || 0}</p>
              <p className="text-xs text-green-600">{formatCurrency(dashboard.labour_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 cursor-pointer" onClick={() => handleTabChange('procurement')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <Truck className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Procurement</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-purple-700">{dashboard.pending_procurement || 0}</p>
              <p className="text-xs text-purple-600">{formatCurrency(dashboard.procurement_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-orange-600 mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Total Pending</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-orange-700">
                {(dashboard.pending_material || 0) + (dashboard.pending_labour || 0) + (dashboard.pending_procurement || 0)}
              </p>
              <p className="text-xs text-orange-600">{formatCurrency(dashboard.total_pending)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Payments */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Pending Payments</CardTitle>
                <TabsList className="bg-transparent p-0">
                  <TabsTrigger value="all" className="data-[state=active]:border-b-2 data-[state=active]:border-gray-600 rounded-none text-xs sm:text-sm">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="material" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none text-xs sm:text-sm">
                    Material
                  </TabsTrigger>
                  <TabsTrigger value="labour" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none text-xs sm:text-sm">
                    Labour
                  </TabsTrigger>
                  <TabsTrigger value="procurement" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none text-xs sm:text-sm">
                    Procurement
                  </TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden divide-y">
                {pendingPayments.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No pending payments</div>
                ) : (
                  pendingPayments.map((item, index) => (
                    <div key={index} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(item.payment_type)}
                          <span className="font-semibold">{item.material_name || item.labour_type || 'Order'}</span>
                        </div>
                        {getTypeBadge(item.payment_type)}
                      </div>
                      <div className="text-sm text-gray-500 mb-2">
                        <p>Project: {item.project_name}</p>
                        {item.vendor_name && <p>Vendor: {item.vendor_name}</p>}
                        {item.selected_vendor_name && <p>Vendor: {item.selected_vendor_name}</p>}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold text-green-600">
                          {formatCurrency(item.final_amount || item.total_amount || item.estimated_cost)}
                        </span>
                        <Button size="sm" onClick={() => openPaymentDialog(item)}>
                          <DollarSign className="h-3 w-3 mr-1" /> Process
                        </Button>
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">TYPE</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">VENDOR</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingPayments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500">No pending payments</td>
                      </tr>
                    ) : (
                      pendingPayments.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.payment_type)}
                              {getTypeBadge(item.payment_type)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.material_name || item.labour_type || 'Procurement Order'}</p>
                            {item.quantity && <p className="text-xs text-gray-500">Qty: {item.quantity} {item.unit}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm">{item.project_name}</td>
                          <td className="px-4 py-3 text-sm">
                            {item.vendor_name || item.selected_vendor_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">
                            {formatCurrency(item.final_amount || item.total_amount || item.estimated_cost)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button size="sm" onClick={() => openPaymentDialog(item)}>
                              <DollarSign className="h-3 w-3 mr-1" /> Process
                            </Button>
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

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              {/* Item Details */}
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getTypeIcon(selectedItem.payment_type)}
                    {getTypeBadge(selectedItem.payment_type)}
                  </div>
                  <p className="font-semibold">{selectedItem.material_name || selectedItem.labour_type || 'Procurement Order'}</p>
                  <p className="text-sm text-gray-500">Project: {selectedItem.project_name}</p>
                  {(selectedItem.vendor_name || selectedItem.selected_vendor_name) && (
                    <p className="text-sm text-gray-500">Vendor: {selectedItem.vendor_name || selectedItem.selected_vendor_name}</p>
                  )}
                  <p className="text-xl font-bold text-green-600 mt-2">
                    {formatCurrency(selectedItem.final_amount || selectedItem.total_amount || selectedItem.estimated_cost)}
                  </p>
                </CardContent>
              </Card>

              {/* Payment Options */}
              <div>
                <Label>Payment Type</Label>
                <Select value={paymentForm.payment_type} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        Full Payment
                      </div>
                    </SelectItem>
                    <SelectItem value="partial">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        Partial Payment
                      </div>
                    </SelectItem>
                    <SelectItem value="credit">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-blue-600" />
                        Credit (No Payment)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentForm.payment_type === 'partial' && (
                <div>
                  <Label>Payment Amount</Label>
                  <Input 
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    placeholder="Enter amount"
                  />
                </div>
              )}

              <div>
                <Label>Remarks (Optional)</Label>
                <Textarea 
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  placeholder="Add any notes..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleProcessPayment} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="h-4 w-4 mr-2" /> Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
