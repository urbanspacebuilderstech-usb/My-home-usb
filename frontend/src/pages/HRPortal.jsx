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
  Users, LogOut, UserPlus, Briefcase, Calendar, DollarSign,
  CheckCircle, Clock, AlertTriangle, Edit, Trash2, Eye,
  Building2, Phone, Mail, CreditCard, Banknote, FileText,
  ArrowLeft, Plus, RefreshCw, Search, Calculator
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEPARTMENTS = ['Accounts', 'Engineering', 'HR', 'Admin', 'Sales', 'Operations', 'Planning', 'Procurement'];
const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' }
];

export default function HRPortal() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('staff');
  
  const [staff, setStaff] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [attendance, setAttendance] = useState([]);
  
  const [staffDialog, setStaffDialog] = useState(false);
  const [payrollDialog, setPayrollDialog] = useState(false);
  const [attendanceDialog, setAttendanceDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  
  const [staffForm, setStaffForm] = useState({
    name: '', email: '', phone: '', department: '', designation: '',
    date_of_joining: '', basic_salary: '', hra: '', da: '', ta: '',
    other_allowances: '', pf: '', esi: '', professional_tax: '', tds: '',
    other_deductions: '', bank_name: '', account_number: '', ifsc_code: '',
    payment_method: 'bank_transfer'
  });
  
  const [payrollGenForm, setPayrollGenForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  
  const [paymentForm, setPaymentForm] = useState({
    transaction_id: '',
    payment_method: 'bank_transfer',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, staffRes, payrollRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/hr/staff`),
        axios.get(`${API}/hr/payroll`)
      ]);
      
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setStaff(staffRes.data);
      setPayroll(payrollRes.data);
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

  const openAddStaffDialog = () => {
    setSelectedStaff(null);
    setStaffForm({
      name: '', email: '', phone: '', department: '', designation: '',
      date_of_joining: '', basic_salary: '', hra: '', da: '', ta: '',
      other_allowances: '', pf: '', esi: '', professional_tax: '', tds: '',
      other_deductions: '', bank_name: '', account_number: '', ifsc_code: '',
      payment_method: 'bank_transfer'
    });
    setStaffDialog(true);
  };

  const openEditStaffDialog = (s) => {
    setSelectedStaff(s);
    setStaffForm({
      name: s.name || '',
      email: s.email || '',
      phone: s.phone || '',
      department: s.department || '',
      designation: s.designation || '',
      date_of_joining: s.date_of_joining?.split('T')[0] || '',
      basic_salary: s.basic_salary?.toString() || '',
      hra: s.hra?.toString() || '',
      da: s.da?.toString() || '',
      ta: s.ta?.toString() || '',
      other_allowances: s.other_allowances?.toString() || '',
      pf: s.pf?.toString() || '',
      esi: s.esi?.toString() || '',
      professional_tax: s.professional_tax?.toString() || '',
      tds: s.tds?.toString() || '',
      other_deductions: s.other_deductions?.toString() || '',
      bank_name: s.bank_name || '',
      account_number: s.account_number || '',
      ifsc_code: s.ifsc_code || '',
      payment_method: s.payment_method || 'bank_transfer'
    });
    setStaffDialog(true);
  };

  const handleSaveStaff = async () => {
    if (!staffForm.name) {
      toast.error('Name is required');
      return;
    }

    try {
      const payload = {
        ...staffForm,
        basic_salary: parseFloat(staffForm.basic_salary) || 0,
        hra: parseFloat(staffForm.hra) || 0,
        da: parseFloat(staffForm.da) || 0,
        ta: parseFloat(staffForm.ta) || 0,
        other_allowances: parseFloat(staffForm.other_allowances) || 0,
        pf: parseFloat(staffForm.pf) || 0,
        esi: parseFloat(staffForm.esi) || 0,
        professional_tax: parseFloat(staffForm.professional_tax) || 0,
        tds: parseFloat(staffForm.tds) || 0,
        other_deductions: parseFloat(staffForm.other_deductions) || 0,
        date_of_joining: staffForm.date_of_joining ? new Date(staffForm.date_of_joining).toISOString() : null
      };

      if (selectedStaff) {
        await axios.patch(`${API}/hr/staff/${selectedStaff.staff_id}`, payload);
        toast.success('Staff updated');
      } else {
        await axios.post(`${API}/hr/staff`, payload);
        toast.success('Staff added');
      }
      
      setStaffDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save staff');
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!confirm('Are you sure you want to terminate this staff member?')) return;
    
    try {
      await axios.delete(`${API}/hr/staff/${staffId}`);
      toast.success('Staff terminated');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to terminate staff');
    }
  };

  const handleGeneratePayroll = async () => {
    try {
      await axios.post(`${API}/hr/payroll/generate`, payrollGenForm);
      toast.success('Payroll generated');
      setPayrollDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate payroll');
    }
  };

  const handleApprovePayroll = async (payrollId) => {
    try {
      await axios.patch(`${API}/hr/payroll/${payrollId}/approve`);
      toast.success('Payroll approved');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve payroll');
    }
  };

  const openPaymentDialog = (p) => {
    setSelectedPayroll(p);
    setPaymentForm({ transaction_id: '', payment_method: 'bank_transfer', remarks: '' });
    setPaymentDialog(true);
  };

  const handlePayPayroll = async () => {
    if (!paymentForm.transaction_id) {
      toast.error('Transaction ID is required');
      return;
    }

    try {
      await axios.patch(`${API}/hr/payroll/${selectedPayroll.payroll_id}/pay`, paymentForm);
      toast.success('Payroll paid');
      setPaymentDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process payment');
    }
  };

  const calculateSalary = () => {
    const gross = (parseFloat(staffForm.basic_salary) || 0) + 
                  (parseFloat(staffForm.hra) || 0) + 
                  (parseFloat(staffForm.da) || 0) + 
                  (parseFloat(staffForm.ta) || 0) + 
                  (parseFloat(staffForm.other_allowances) || 0);
    
    const deductions = (parseFloat(staffForm.pf) || 0) + 
                       (parseFloat(staffForm.esi) || 0) + 
                       (parseFloat(staffForm.professional_tax) || 0) + 
                       (parseFloat(staffForm.tds) || 0) + 
                       (parseFloat(staffForm.other_deductions) || 0);
    
    return { gross, deductions, net: gross - deductions };
  };

  const filteredStaff = staff.filter(s => {
    const matchesSearch = !searchTerm || 
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = !departmentFilter || s.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const statusBadge = (status) => {
    const config = {
      active: { label: 'Active', class: 'bg-green-100 text-green-700' },
      on_leave: { label: 'On Leave', class: 'bg-yellow-100 text-yellow-700' },
      terminated: { label: 'Terminated', class: 'bg-red-100 text-red-700' },
      draft: { label: 'Draft', class: 'bg-gray-100 text-gray-700' },
      pending_approval: { label: 'Pending', class: 'bg-yellow-100 text-yellow-700' },
      approved: { label: 'Approved', class: 'bg-blue-100 text-blue-700' },
      paid: { label: 'Paid', class: 'bg-green-100 text-green-700' }
    };
    const c = config[status] || { label: status, class: 'bg-gray-100 text-gray-700' };
    return <Badge className={c.class}>{c.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  const salary = calculateSalary();
  const activeStaff = staff.filter(s => s.status === 'active').length;
  const totalSalaryBudget = staff.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.net_salary || 0), 0);
  const pendingPayroll = payroll.filter(p => ['draft', 'pending_approval', 'approved'].includes(p.status));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/accountant-dashboard'}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-2 rounded-lg">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">HR Portal</h1>
              <p className="text-xs text-gray-500">Staff Management & Payroll</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-gray-500 uppercase">{user?.role?.replace('_', ' ')}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <Users className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{activeStaff}</p>
              <p className="text-sm text-violet-100">Active Staff</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
            <CardContent className="p-4">
              <DollarSign className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{formatCurrency(totalSalaryBudget)}</p>
              <p className="text-sm text-blue-100">Monthly Budget</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <Clock className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{pendingPayroll.length}</p>
              <p className="text-sm text-amber-100">Pending Payroll</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <CardContent className="p-4">
              <CheckCircle className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{payroll.filter(p => p.status === 'paid').length}</p>
              <p className="text-sm text-green-100">Paid This Month</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="staff" data-testid="tab-staff">Staff Management</TabsTrigger>
            <TabsTrigger value="payroll" data-testid="tab-payroll">Payroll</TabsTrigger>
          </TabsList>

          {/* Staff Management Tab */}
          <TabsContent value="staff">
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-lg">Staff Directory</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input 
                        placeholder="Search staff..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 w-48"
                        data-testid="search-staff"
                      />
                    </div>
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="w-40" data-testid="filter-department">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All Departments</SelectItem>
                        {DEPARTMENTS.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={openAddStaffDialog} data-testid="add-staff-btn">
                      <UserPlus className="h-4 w-4 mr-1" /> Add Staff
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">EMPLOYEE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DEPARTMENT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CONTACT</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">GROSS</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">NET SALARY</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredStaff.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                            No staff members found
                          </td>
                        </tr>
                      ) : (
                        filteredStaff.map((s) => (
                          <tr key={s.staff_id} className="hover:bg-gray-50" data-testid={`staff-row-${s.staff_id}`}>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium">{s.name}</p>
                                <p className="text-xs text-gray-500">{s.employee_code} | {s.designation || 'N/A'}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">{s.department || '-'}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm">
                                {s.email && <p className="text-gray-600">{s.email}</p>}
                                {s.phone && <p className="text-gray-500">{s.phone}</p>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-sm">{formatCurrency(s.gross_salary)}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(s.net_salary)}</td>
                            <td className="px-4 py-3 text-center">{statusBadge(s.status)}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openEditStaffDialog(s)} data-testid={`edit-staff-${s.staff_id}`}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {s.status === 'active' && (
                                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteStaff(s.staff_id)} data-testid={`delete-staff-${s.staff_id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payroll Tab */}
          <TabsContent value="payroll">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Payroll Management</CardTitle>
                  <Button onClick={() => setPayrollDialog(true)} data-testid="generate-payroll-btn">
                    <Calculator className="h-4 w-4 mr-1" /> Generate Payroll
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">EMPLOYEE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PERIOD</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">DAYS</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">GROSS</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">DEDUCTIONS</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">NET PAY</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {payroll.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                            No payroll records. Generate payroll to get started.
                          </td>
                        </tr>
                      ) : (
                        payroll.map((p) => (
                          <tr key={p.payroll_id} className="hover:bg-gray-50" data-testid={`payroll-row-${p.payroll_id}`}>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium">{p.staff_name}</p>
                                <p className="text-xs text-gray-500">{p.employee_code} | {p.department || 'N/A'}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {new Date(p.year, p.month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-center text-sm">
                              {p.days_present}/{p.working_days}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">{formatCurrency(p.gross_earnings)}</td>
                            <td className="px-4 py-3 text-right text-sm text-red-600">-{formatCurrency(p.total_deductions)}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(p.net_pay)}</td>
                            <td className="px-4 py-3 text-center">{statusBadge(p.status)}</td>
                            <td className="px-4 py-3 text-center">
                              {p.status === 'draft' && (
                                <Button size="sm" onClick={() => handleApprovePayroll(p.payroll_id)} data-testid={`approve-payroll-${p.payroll_id}`}>
                                  Approve
                                </Button>
                              )}
                              {p.status === 'approved' && (
                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openPaymentDialog(p)} data-testid={`pay-payroll-${p.payroll_id}`}>
                                  <DollarSign className="h-3 w-3 mr-1" /> Pay
                                </Button>
                              )}
                              {p.status === 'paid' && (
                                <span className="text-xs text-gray-500">
                                  Paid on {new Date(p.payment_date).toLocaleDateString()}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Staff Dialog */}
      <Dialog open={staffDialog} onOpenChange={setStaffDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedStaff ? 'Edit Staff' : 'Add New Staff'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Basic Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={staffForm.name} onChange={(e) => setStaffForm({...staffForm, name: e.target.value})} data-testid="input-name" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={staffForm.email} onChange={(e) => setStaffForm({...staffForm, email: e.target.value})} data-testid="input-email" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={staffForm.phone} onChange={(e) => setStaffForm({...staffForm, phone: e.target.value})} data-testid="input-phone" />
                </div>
                <div>
                  <Label>Department</Label>
                  <Select value={staffForm.department} onValueChange={(v) => setStaffForm({...staffForm, department: v})}>
                    <SelectTrigger data-testid="select-department"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Designation</Label>
                  <Input value={staffForm.designation} onChange={(e) => setStaffForm({...staffForm, designation: e.target.value})} data-testid="input-designation" />
                </div>
                <div>
                  <Label>Date of Joining</Label>
                  <Input type="date" value={staffForm.date_of_joining} onChange={(e) => setStaffForm({...staffForm, date_of_joining: e.target.value})} data-testid="input-doj" />
                </div>
              </div>
            </div>

            {/* Salary Details */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Salary Details
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Basic Salary</Label>
                  <Input type="number" value={staffForm.basic_salary} onChange={(e) => setStaffForm({...staffForm, basic_salary: e.target.value})} data-testid="input-basic" />
                </div>
                <div>
                  <Label>HRA</Label>
                  <Input type="number" value={staffForm.hra} onChange={(e) => setStaffForm({...staffForm, hra: e.target.value})} />
                </div>
                <div>
                  <Label>DA</Label>
                  <Input type="number" value={staffForm.da} onChange={(e) => setStaffForm({...staffForm, da: e.target.value})} />
                </div>
                <div>
                  <Label>TA</Label>
                  <Input type="number" value={staffForm.ta} onChange={(e) => setStaffForm({...staffForm, ta: e.target.value})} />
                </div>
                <div>
                  <Label>Other Allowances</Label>
                  <Input type="number" value={staffForm.other_allowances} onChange={(e) => setStaffForm({...staffForm, other_allowances: e.target.value})} />
                </div>
                <div className="bg-green-50 p-2 rounded flex flex-col justify-center">
                  <span className="text-xs text-green-600">Gross Salary</span>
                  <span className="font-bold text-green-700">{formatCurrency(salary.gross)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Deductions
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>PF</Label>
                  <Input type="number" value={staffForm.pf} onChange={(e) => setStaffForm({...staffForm, pf: e.target.value})} />
                </div>
                <div>
                  <Label>ESI</Label>
                  <Input type="number" value={staffForm.esi} onChange={(e) => setStaffForm({...staffForm, esi: e.target.value})} />
                </div>
                <div>
                  <Label>Professional Tax</Label>
                  <Input type="number" value={staffForm.professional_tax} onChange={(e) => setStaffForm({...staffForm, professional_tax: e.target.value})} />
                </div>
                <div>
                  <Label>TDS</Label>
                  <Input type="number" value={staffForm.tds} onChange={(e) => setStaffForm({...staffForm, tds: e.target.value})} />
                </div>
                <div>
                  <Label>Other Deductions</Label>
                  <Input type="number" value={staffForm.other_deductions} onChange={(e) => setStaffForm({...staffForm, other_deductions: e.target.value})} />
                </div>
                <div className="bg-red-50 p-2 rounded flex flex-col justify-center">
                  <span className="text-xs text-red-600">Total Deductions</span>
                  <span className="font-bold text-red-700">-{formatCurrency(salary.deductions)}</span>
                </div>
              </div>
            </div>

            {/* Net Salary Display */}
            <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200">
              <CardContent className="p-4 flex justify-between items-center">
                <span className="font-semibold text-emerald-700">Net Salary (Take Home)</span>
                <span className="text-2xl font-bold text-emerald-700">{formatCurrency(salary.net)}</span>
              </CardContent>
            </Card>

            {/* Bank Details */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Bank Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bank Name</Label>
                  <Input value={staffForm.bank_name} onChange={(e) => setStaffForm({...staffForm, bank_name: e.target.value})} />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input value={staffForm.account_number} onChange={(e) => setStaffForm({...staffForm, account_number: e.target.value})} />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input value={staffForm.ifsc_code} onChange={(e) => setStaffForm({...staffForm, ifsc_code: e.target.value})} />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={staffForm.payment_method} onValueChange={(v) => setStaffForm({...staffForm, payment_method: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveStaff} className="bg-violet-600 hover:bg-violet-700" data-testid="save-staff-btn">
              <CheckCircle className="h-4 w-4 mr-1" /> {selectedStaff ? 'Update' : 'Add'} Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Payroll Dialog */}
      <Dialog open={payrollDialog} onOpenChange={setPayrollDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Payroll</DialogTitle>
            <DialogDescription>Generate payroll for all active staff members for the selected month.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Month</Label>
              <Select value={payrollGenForm.month.toString()} onValueChange={(v) => setPayrollGenForm({...payrollGenForm, month: parseInt(v)})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...Array(12)].map((_, i) => (
                    <SelectItem key={i+1} value={(i+1).toString()}>
                      {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Select value={payrollGenForm.year.toString()} onValueChange={(v) => setPayrollGenForm({...payrollGenForm, year: parseInt(v)})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayrollDialog(false)}>Cancel</Button>
            <Button onClick={handleGeneratePayroll} className="bg-violet-600 hover:bg-violet-700" data-testid="confirm-generate-payroll">
              <Calculator className="h-4 w-4 mr-1" /> Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Payroll Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Salary Payment</DialogTitle>
          </DialogHeader>
          
          {selectedPayroll && (
            <div className="space-y-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedPayroll.staff_name}</p>
                  <p className="text-sm text-gray-600">{selectedPayroll.employee_code}</p>
                  <p className="text-2xl font-bold text-green-700 mt-2">{formatCurrency(selectedPayroll.net_pay)}</p>
                </CardContent>
              </Card>
              
              <div>
                <Label>Transaction ID / Reference *</Label>
                <Input 
                  value={paymentForm.transaction_id}
                  onChange={(e) => setPaymentForm({...paymentForm, transaction_id: e.target.value})}
                  placeholder="Enter transaction ID"
                  data-testid="input-transaction-id"
                />
              </div>
              
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({...paymentForm, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({...paymentForm, remarks: e.target.value})}
                  placeholder="Optional notes..."
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handlePayPayroll} className="bg-green-600 hover:bg-green-700" data-testid="confirm-pay-payroll">
              <CheckCircle className="h-4 w-4 mr-1" /> Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
