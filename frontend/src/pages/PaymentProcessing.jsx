import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Shield, LogOut, DollarSign, CheckCircle, Clock, AlertTriangle,
  ArrowLeft, RefreshCw, Send, Lock, Key, CreditCard, Banknote,
  Landmark, Building2
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'cheque', label: 'Cheque', icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Landmark },
  { value: 'upi', label: 'UPI', icon: Send },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard }
];

export default function PaymentProcessing() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [initiateDialog, setInitiateDialog] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [completeDialog, setCompleteDialog] = useState(false);
  
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [mockOTP, setMockOTP] = useState(null);
  
  const [initiateForm, setInitiateForm] = useState({
    request_type: 'vendor_payment',
    request_id: '',
    amount: '',
    party_name: '',
    party_email: '',
    party_phone: ''
  });
  
  const [otpInput, setOtpInput] = useState('');
  
  const [completeForm, setCompleteForm] = useState({
    transaction_id: '',
    payment_method: 'bank_transfer',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, requestsRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accountant/payment-requests`),
        axios.get(`${API}/projects`)
      ]);
      
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setPaymentRequests(requestsRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const handleInitiatePayment = async () => {
    if (!initiateForm.amount || !initiateForm.party_name) {
      toast.error('Amount and Party Name are required');
      return;
    }

    try {
      const params = new URLSearchParams({
        request_type: initiateForm.request_type,
        request_id: initiateForm.request_id || `manual_${Date.now()}`,
        amount: initiateForm.amount,
        party_name: initiateForm.party_name,
        party_email: initiateForm.party_email || '',
        party_phone: initiateForm.party_phone || ''
      });

      const response = await axios.post(`${API}/accountant/payment-request/initiate?${params.toString()}`);
      
      toast.success('Payment request initiated');
      
      // Store mock OTP if provided (for testing without email)
      if (response.data.otp_for_testing) {
        setMockOTP(response.data.otp_for_testing);
        toast.info(`Test OTP: ${response.data.otp_for_testing}`, { duration: 10000 });
      }
      
      setSelectedRequest(response.data);
      setInitiateDialog(false);
      setVerifyDialog(true);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to initiate payment');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpInput || otpInput.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      await axios.post(`${API}/accountant/payment-request/verify-otp`, {
        verification_id: selectedRequest.verification_id,
        otp: otpInput
      });
      
      toast.success('OTP verified successfully');
      setVerifyDialog(false);
      setCompleteDialog(true);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    }
  };

  const handleCompletePayment = async () => {
    if (!completeForm.transaction_id) {
      toast.error('Transaction ID is required');
      return;
    }

    try {
      await axios.post(`${API}/accountant/payment-request/complete`, {
        verification_id: selectedRequest.verification_id,
        transaction_id: completeForm.transaction_id,
        payment_method: completeForm.payment_method,
        remarks: completeForm.remarks
      });
      
      toast.success('Payment completed successfully!');
      setCompleteDialog(false);
      setSelectedRequest(null);
      setMockOTP(null);
      setOtpInput('');
      setCompleteForm({ transaction_id: '', payment_method: 'bank_transfer', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete payment');
    }
  };

  const openVerifyDialog = (request) => {
    setSelectedRequest(request);
    setOtpInput('');
    setVerifyDialog(true);
  };

  const openCompleteDialog = (request) => {
    setSelectedRequest(request);
    setCompleteForm({ transaction_id: '', payment_method: 'bank_transfer', remarks: '' });
    setCompleteDialog(true);
  };

  const getStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', class: 'bg-gray-100 text-gray-700' },
      otp_sent: { label: 'OTP Sent', class: 'bg-yellow-100 text-yellow-700' },
      otp_verified: { label: 'Verified', class: 'bg-amber-50 text-amber-700' },
      approved: { label: 'Approved', class: 'bg-green-100 text-green-700' },
      rejected: { label: 'Rejected', class: 'bg-red-100 text-red-700' },
      completed: { label: 'Completed', class: 'bg-emerald-100 text-emerald-700' }
    };
    const c = config[status] || { label: status, class: 'bg-gray-100 text-gray-700' };
    return <Badge className={c.class}>{c.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  const pendingRequests = paymentRequests.filter(r => ['pending', 'otp_sent'].includes(r.status));
  const verifiedRequests = paymentRequests.filter(r => r.status === 'otp_verified');
  const completedRequests = paymentRequests.filter(r => r.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            <CardContent className="p-4">
              <Clock className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{pendingRequests.length}</p>
              <p className="text-sm text-amber-100">Awaiting OTP</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
            <CardContent className="p-4">
              <Key className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{verifiedRequests.length}</p>
              <p className="text-sm text-blue-100">OTP Verified</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <CardContent className="p-4">
              <CheckCircle className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{completedRequests.length}</p>
              <p className="text-sm text-green-100">Completed</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <DollarSign className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{formatCurrency(completedRequests.reduce((sum, r) => sum + (r.amount || 0), 0))}</p>
              <p className="text-sm text-violet-100">Total Processed</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Requests Table */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              Payment Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">REQUEST ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">TYPE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PARTY</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">REQUESTED BY</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paymentRequests.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        No payment requests found. Click "New Payment" to create one.
                      </td>
                    </tr>
                  ) : (
                    paymentRequests.map((request) => (
                      <tr key={request.verification_id} className="hover:bg-gray-50" data-testid={`payment-row-${request.verification_id}`}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-sm">{request.verification_id}</p>
                          <p className="text-xs text-gray-500">{request.request_id}</p>
                        </td>
                        <td className="px-4 py-3 text-sm capitalize">{request.request_type?.replace('_', ' ')}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{request.party_name}</p>
                          {request.party_email && <p className="text-xs text-gray-500">{request.party_email}</p>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(request.amount)}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(request.status)}</td>
                        <td className="px-4 py-3 text-sm">{request.requested_by_name || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {request.status === 'otp_sent' && (
                            <Button size="sm" onClick={() => openVerifyDialog(request)} data-testid={`verify-otp-${request.verification_id}`}>
                              <Key className="h-3 w-3 mr-1" /> Verify OTP
                            </Button>
                          )}
                          {request.status === 'otp_verified' && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openCompleteDialog(request)} data-testid={`complete-payment-${request.verification_id}`}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Complete
                            </Button>
                          )}
                          {request.status === 'completed' && (
                            <span className="text-xs text-green-600 font-semibold">
                              ✓ {request.transaction_id}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Initiate Payment Dialog */}
      <Dialog open={initiateDialog} onOpenChange={setInitiateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Initiate New Payment
            </DialogTitle>
            <DialogDescription>
              Start a new payment request with OTP verification
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Payment Type</Label>
              <Select value={initiateForm.request_type} onValueChange={(v) => setInitiateForm({...initiateForm, request_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor_payment">Vendor Payment</SelectItem>
                  <SelectItem value="contractor_payment">Contractor Payment</SelectItem>
                  <SelectItem value="material_payment">Material Payment</SelectItem>
                  <SelectItem value="salary">Salary Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Party Name *</Label>
              <Input 
                value={initiateForm.party_name}
                onChange={(e) => setInitiateForm({...initiateForm, party_name: e.target.value})}
                placeholder="Vendor/Contractor name"
                data-testid="input-party-name"
              />
            </div>
            
            <div>
              <Label>Amount *</Label>
              <Input 
                type="number"
                value={initiateForm.amount}
                onChange={(e) => setInitiateForm({...initiateForm, amount: e.target.value})}
                placeholder="Enter amount"
                data-testid="input-amount"
              />
            </div>
            
            <div>
              <Label>Email (for OTP)</Label>
              <Input 
                type="email"
                value={initiateForm.party_email}
                onChange={(e) => setInitiateForm({...initiateForm, party_email: e.target.value})}
                placeholder="party@email.com"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for mock OTP (testing mode)</p>
            </div>
            
            <div>
              <Label>Phone</Label>
              <Input 
                value={initiateForm.party_phone}
                onChange={(e) => setInitiateForm({...initiateForm, party_phone: e.target.value})}
                placeholder="+91 9876543210"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitiateDialog(false)}>Cancel</Button>
            <Button onClick={handleInitiatePayment} className="bg-emerald-600 hover:bg-emerald-700" data-testid="send-otp-btn">
              <Send className="h-4 w-4 mr-1" /> Send OTP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify OTP Dialog */}
      <Dialog open={verifyDialog} onOpenChange={setVerifyDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Enter OTP
            </DialogTitle>
            <DialogDescription>
              Enter the 6-digit OTP to verify this payment
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <Card className="bg-amber-50 border-blue-200">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-amber-600">Payment Amount</p>
                  <p className="text-2xl font-bold text-amber-700">{formatCurrency(selectedRequest.amount)}</p>
                  <p className="text-sm text-amber-600 mt-1">To: {selectedRequest.party_name}</p>
                </CardContent>
              </Card>
              
              {mockOTP && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-amber-600 font-medium">TEST MODE - OTP:</p>
                  <p className="text-2xl font-mono font-bold text-amber-700 tracking-widest">{mockOTP}</p>
                </div>
              )}
              
              <div>
                <Label>Enter OTP</Label>
                <Input 
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  className="text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  data-testid="input-otp"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog(false)}>Cancel</Button>
            <Button onClick={handleVerifyOTP} className="bg-secondary hover:bg-secondary/90" data-testid="verify-otp-btn">
              <Key className="h-4 w-4 mr-1" /> Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Payment Dialog */}
      <Dialog open={completeDialog} onOpenChange={setCompleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Complete Payment
            </DialogTitle>
            <DialogDescription>
              OTP verified! Enter transaction details to complete.
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{selectedRequest.party_name}</p>
                      <p className="text-sm text-gray-600">{selectedRequest.request_type?.replace('_', ' ')}</p>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(selectedRequest.amount)}</p>
                  </div>
                </CardContent>
              </Card>
              
              <div>
                <Label>Transaction ID / Reference *</Label>
                <Input 
                  value={completeForm.transaction_id}
                  onChange={(e) => setCompleteForm({...completeForm, transaction_id: e.target.value})}
                  placeholder="Enter transaction ID"
                  data-testid="input-transaction-id"
                />
              </div>
              
              <div>
                <Label>Payment Method</Label>
                <Select value={completeForm.payment_method} onValueChange={(v) => setCompleteForm({...completeForm, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={completeForm.remarks}
                  onChange={(e) => setCompleteForm({...completeForm, remarks: e.target.value})}
                  placeholder="Optional notes..."
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(false)}>Cancel</Button>
            <Button onClick={handleCompletePayment} className="bg-green-600 hover:bg-green-700" data-testid="confirm-payment-btn">
              <CheckCircle className="h-4 w-4 mr-1" /> Complete Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
