import React, { useState, useEffect, useCallback } from 'react';
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
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Users, UserPlus, Briefcase, Calendar, Edit, Trash2, Eye,
  Phone, Mail, CreditCard, FileText, Search, RefreshCw, Upload,
  Shield, Key, UserCheck, ChevronDown, ChevronUp, X, Check
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEPARTMENTS = ['Accounts', 'Engineering', 'HR', 'Admin', 'Sales', 'Operations', 'Planning', 'Procurement', 'CRM', 'Design'];
const DESIGNATIONS = [
  'General Manager', 'Project Manager', 'Associate Project Manager', 'Senior Site Engineer',
  'Site Engineer', 'Architect', 'Accountant', 'HR Manager', 'HR Executive',
  'Planning Engineer', 'Procurement Officer', 'Sales Executive', 'Pre-Sales Executive',
  'CRE Executive', 'Marketing Head', 'Admin Executive', 'Office Assistant', 'Driver', 'Helper'
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];
const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' }
];

const ALL_ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'general_manager', label: 'General Manager' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'associate_pm', label: 'Associate PM' },
  { value: 'sr_site_engineer', label: 'Sr. Site Engineer' },
  { value: 'site_engineer', label: 'Site Engineer' },
  { value: 'planning', label: 'Planning' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'cre', label: 'CRE' },
  { value: 'hr', label: 'HR' },
  { value: 'pre_sales', label: 'Pre-Sales' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing_head', label: 'Marketing Head' },
  { value: 'architect', label: 'Architect' },
  { value: 'client', label: 'Client' },
  { value: 'vendor', label: 'Vendor' },
];

export default function HRPortal() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('employees');

  // Employee data
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Users data (Roles & Credentials)
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Dialogs
  const [staffDialog, setStaffDialog] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
  const [viewingStaff, setViewingStaff] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [roleDialog, setRoleDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [resetPwdDialog, setResetPwdDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [createUserDialog, setCreateUserDialog] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ staff_id: '', email: '', password: '', confirm_password: '', role: '', name: '' });

  // Form state
  const [staffForm, setStaffForm] = useState(getEmptyForm());
  const [expandedSection, setExpandedSection] = useState('personal');

  function getEmptyForm() {
    return {
      name: '', email: '', phone: '', department: '', designation: '',
      date_of_joining: '', date_of_birth: '', gender: '', marital_status: '',
      blood_group: '', father_name: '', mother_name: '',
      address: '', permanent_address: '', current_address: '',
      aadhar_number: '', pan_number: '', uan_number: '', esi_number: '',
      emergency_contact: '', emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '',
      qualification: '', experience_years: '', previous_employer: '',
      basic_salary: '', hra: '', da: '', ta: '', other_allowances: '',
      pf: '', esi: '', professional_tax: '', tds: '', other_deductions: '',
      bank_name: '', account_number: '', ifsc_code: '', payment_method: 'bank_transfer',
      notes: ''
    };
  }

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['super_admin', 'hr'].includes(userRes.data.role)) {
        toast.error('Access denied');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);

      const [staffRes, usersRes] = await Promise.allSettled([
        axios.get(`${API}/hr/staff`),
        axios.get(`${API}/hr/users`)
      ]);

      if (staffRes.status === 'fulfilled') {
        setStaff(staffRes.value.data || []);
      } else {
        console.error('Staff fetch failed:', staffRes.reason?.response?.status, staffRes.reason?.message);
      }
      if (usersRes.status === 'fulfilled') {
        setAllUsers(usersRes.value.data || []);
      } else {
        console.error('Users fetch failed:', usersRes.reason?.response?.status, usersRes.reason?.message);
      }
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 15000);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  const getRoleLabel = (role) => ALL_ROLES.find(r => r.value === role)?.label || role?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '-';

  // ============ EMPLOYEE HANDLERS ============
  const openAddEmployee = () => {
    setSelectedStaff(null);
    setStaffForm(getEmptyForm());
    setExpandedSection('personal');
    setStaffDialog(true);
  };

  const openEditEmployee = (s) => {
    setSelectedStaff(s);
    setStaffForm({
      name: s.name || '', email: s.email || '', phone: s.phone || '',
      department: s.department || '', designation: s.designation || '',
      date_of_joining: s.date_of_joining?.split('T')[0] || '',
      date_of_birth: s.date_of_birth?.split('T')[0] || '',
      gender: s.gender || '', marital_status: s.marital_status || '',
      blood_group: s.blood_group || '', father_name: s.father_name || '',
      mother_name: s.mother_name || '',
      address: s.address || '', permanent_address: s.permanent_address || '',
      current_address: s.current_address || '',
      aadhar_number: s.aadhar_number || '', pan_number: s.pan_number || '',
      uan_number: s.uan_number || '', esi_number: s.esi_number || '',
      emergency_contact: s.emergency_contact || '',
      emergency_contact_name: s.emergency_contact_name || '',
      emergency_contact_relation: s.emergency_contact_relation || '',
      emergency_contact_phone: s.emergency_contact_phone || '',
      qualification: s.qualification || '',
      experience_years: s.experience_years?.toString() || '',
      previous_employer: s.previous_employer || '',
      basic_salary: s.basic_salary?.toString() || '',
      hra: s.hra?.toString() || '', da: s.da?.toString() || '',
      ta: s.ta?.toString() || '', other_allowances: s.other_allowances?.toString() || '',
      pf: s.pf?.toString() || '', esi_val: s.esi?.toString() || '',
      professional_tax: s.professional_tax?.toString() || '',
      tds: s.tds?.toString() || '', other_deductions: s.other_deductions?.toString() || '',
      bank_name: s.bank_name || '', account_number: s.account_number || '',
      ifsc_code: s.ifsc_code || '', payment_method: s.payment_method || 'bank_transfer',
      notes: s.notes || ''
    });
    setExpandedSection('personal');
    setStaffDialog(true);
  };

  const openViewEmployee = (s) => {
    setViewingStaff(s);
    setViewDialog(true);
  };

  const handleSaveEmployee = async () => {
    if (!staffForm.name) { toast.error('Name is required'); return; }
    try {
      const payload = {
        ...staffForm,
        basic_salary: parseFloat(staffForm.basic_salary) || 0,
        hra: parseFloat(staffForm.hra) || 0,
        da: parseFloat(staffForm.da) || 0,
        ta: parseFloat(staffForm.ta) || 0,
        other_allowances: parseFloat(staffForm.other_allowances) || 0,
        pf: parseFloat(staffForm.pf) || 0,
        esi: parseFloat(staffForm.esi_val || staffForm.esi) || 0,
        professional_tax: parseFloat(staffForm.professional_tax) || 0,
        tds: parseFloat(staffForm.tds) || 0,
        other_deductions: parseFloat(staffForm.other_deductions) || 0,
        experience_years: parseFloat(staffForm.experience_years) || 0,
        date_of_joining: staffForm.date_of_joining ? new Date(staffForm.date_of_joining).toISOString() : null,
        date_of_birth: staffForm.date_of_birth ? new Date(staffForm.date_of_birth).toISOString() : null
      };

      if (selectedStaff) {
        // Update basic + extended profile fields
        await axios.patch(`${API}/hr/staff/${selectedStaff.staff_id}`, payload);
        const profileFields = {
          father_name: staffForm.father_name, mother_name: staffForm.mother_name,
          blood_group: staffForm.blood_group, gender: staffForm.gender,
          marital_status: staffForm.marital_status, aadhar_number: staffForm.aadhar_number,
          pan_number: staffForm.pan_number, uan_number: staffForm.uan_number,
          esi_number: staffForm.esi_number, permanent_address: staffForm.permanent_address,
          current_address: staffForm.current_address,
          emergency_contact_name: staffForm.emergency_contact_name,
          emergency_contact_relation: staffForm.emergency_contact_relation,
          emergency_contact_phone: staffForm.emergency_contact_phone,
          qualification: staffForm.qualification, experience_years: parseFloat(staffForm.experience_years) || 0,
          previous_employer: staffForm.previous_employer, notes: staffForm.notes
        };
        await axios.patch(`${API}/hr/staff/${selectedStaff.staff_id}/profile`, profileFields);
        toast.success('Employee updated');
      } else {
        await axios.post(`${API}/hr/staff`, payload);
        toast.success('Employee added');
      }
      setStaffDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to save');
    }
  };

  const handleUploadDoc = async (staffId, docType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = docType === 'photo' ? 'image/*' : '.pdf,.doc,.docx,.jpg,.jpeg,.png';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', docType);
      try {
        await axios.post(`${API}/hr/staff/${staffId}/upload-document`, formData);
        toast.success(`${docType} uploaded`);
        fetchData(false);
      } catch (err) {
        toast.error('Upload failed');
      }
    };
    input.click();
  };

  const handleTerminate = async (staffId) => {
    if (!confirm('Terminate this employee?')) return;
    try {
      await axios.delete(`${API}/hr/staff/${staffId}`);
      toast.success('Employee terminated');
      fetchData(false);
    } catch (error) {
      toast.error('Failed');
    }
  };

  // ============ ROLE/CREDENTIALS HANDLERS ============
  const openRoleDialog = (u) => {
    setSelectedUser({ ...u, newRole: u.role, newActive: u.is_active, newName: u.name, newPhone: u.phone || '' });
    setRoleDialog(true);
  };

  const handleUpdateUser = async () => {
    try {
      await axios.patch(`${API}/hr/users/${selectedUser.user_id}/update-role`, {
        role: selectedUser.newRole,
        is_active: selectedUser.newActive,
        name: selectedUser.newName,
        phone: selectedUser.newPhone
      });
      toast.success('User updated');
      setRoleDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      await axios.post(`${API}/hr/users/${selectedUser.user_id}/reset-password`, { new_password: newPassword });
      toast.success('Password reset');
      setResetPwdDialog(false);
      setNewPassword('');
    } catch (error) {
      toast.error('Failed to reset password');
    }
  };

  const handleCreateUser = async () => {
    if (!createUserForm.email || !createUserForm.password || !createUserForm.role) {
      toast.error('Email, password and role are required');
      return;
    }
    if (createUserForm.password !== createUserForm.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }
    if (createUserForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      await axios.post(`${API}/hr/users/create`, {
        email: createUserForm.email,
        password: createUserForm.password,
        confirm_password: createUserForm.confirm_password,
        role: createUserForm.role,
        staff_id: createUserForm.staff_id || null,
        name: createUserForm.name || ''
      });
      toast.success('User created successfully');
      setCreateUserDialog(false);
      setCreateUserForm({ staff_id: '', email: '', password: '', confirm_password: '', role: '', name: '' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API}/hr/users/${userId}`);
      toast.success('User deleted');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete user');
    }
  };

  // ============ FILTERS ============
  const filteredStaff = staff.filter(s => {
    const matchSearch = !searchTerm || s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone?.includes(searchTerm);
    const matchDept = !departmentFilter || s.department === departmentFilter;
    return matchSearch && matchDept;
  });

  const filteredUsers = allUsers.filter(u => {
    const matchSearch = !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase());
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const salary = (() => {
    const gross = ['basic_salary', 'hra', 'da', 'ta', 'other_allowances'].reduce((s, k) => s + (parseFloat(staffForm[k]) || 0), 0);
    const ded = ['pf', 'professional_tax', 'tds', 'other_deductions'].reduce((s, k) => s + (parseFloat(staffForm[k]) || 0), 0) + (parseFloat(staffForm.esi_val || staffForm.esi) || 0);
    return { gross, deductions: ded, net: gross - ded };
  })();

  const activeCount = staff.filter(s => s.status === 'active').length;
  const totalBudget = staff.filter(s => s.status === 'active').reduce((s, e) => s + (e.net_salary || 0), 0);

  if (loading && !user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;
  }

  const SectionHeader = ({ id, label, icon: Icon }) => (
    <button onClick={() => setExpandedSection(expandedSection === id ? '' : id)} className="flex items-center justify-between w-full py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors" type="button">
      <span className="flex items-center gap-2 font-semibold text-sm text-gray-700"><Icon className="h-4 w-4 text-amber-600" />{label}</span>
      {expandedSection === id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Active Employees</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{allUsers.length}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Salary Budget</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalBudget)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Departments</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{new Set(staff.map(s => s.department).filter(Boolean)).size}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="employees" data-testid="tab-employees">
              <Users className="h-4 w-4 mr-1.5" /> Employee Profiles
            </TabsTrigger>
            <TabsTrigger value="credentials" data-testid="tab-credentials">
              <Shield className="h-4 w-4 mr-1.5" /> Roles & Credentials
            </TabsTrigger>
          </TabsList>

          {/* ==================== EMPLOYEE PROFILES TAB ==================== */}
          <TabsContent value="employees">
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-lg" data-testid="employee-profiles-title">Employee Directory</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input placeholder="Search name, code, phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-52" data-testid="search-employee" />
                    </div>
                    <Select value={departmentFilter} onValueChange={(v) => setDepartmentFilter(v === 'all' ? '' : v)}>
                      <SelectTrigger className="w-40" data-testid="filter-department">
                        <SelectValue placeholder="All Depts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button onClick={openAddEmployee} className="bg-amber-600 hover:bg-amber-700" data-testid="add-employee-btn">
                      <UserPlus className="h-4 w-4 mr-1" /> Add Employee
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">JOINING DATE</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">NET SALARY</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredStaff.length === 0 ? (
                        <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">No employees found. Click "Add Employee" to get started.</td></tr>
                      ) : filteredStaff.map(s => (
                        <tr key={s.staff_id} className="hover:bg-gray-50/80 cursor-pointer" data-testid={`employee-row-${s.staff_id}`} onClick={() => openViewEmployee(s)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
                                {s.name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{s.name}</p>
                                <p className="text-xs text-gray-500">{s.employee_code} {s.designation ? `| ${s.designation}` : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.department || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm">
                              {s.email && <p className="text-gray-600 flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</p>}
                              {s.phone && <p className="text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {s.date_of_joining ? new Date(s.date_of_joining).toLocaleDateString('en-IN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(s.net_salary)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={s.status === 'active' ? 'bg-green-100 text-green-700' : s.status === 'terminated' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                              {s.status?.replace(/_/g, ' ') || 'Active'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openViewEmployee(s)} data-testid={`view-employee-${s.staff_id}`}><Eye className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openEditEmployee(s)} data-testid={`edit-employee-${s.staff_id}`}><Edit className="h-4 w-4" /></Button>
                              {s.status === 'active' && (
                                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleTerminate(s.staff_id)} data-testid={`terminate-${s.staff_id}`}><Trash2 className="h-4 w-4" /></Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== ROLES & CREDENTIALS TAB ==================== */}
          <TabsContent value="credentials">
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-lg" data-testid="roles-credentials-title">User Roles & Credentials</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input placeholder="Search name or email..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-9 w-52" data-testid="search-users" />
                    </div>
                    <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
                      <SelectTrigger className="w-40" data-testid="filter-role">
                        <SelectValue placeholder="All Roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {ALL_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => setCreateUserDialog(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="create-user-btn">
                      <UserPlus className="h-4 w-4 mr-1" /> Create User
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">USER</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">EMAIL</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ROLE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">LINKED EMPLOYEE</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.length === 0 ? (
                        <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No users found</td></tr>
                      ) : filteredUsers.map(u => (
                        <tr key={u.user_id} className="hover:bg-gray-50/80" data-testid={`user-row-${u.user_id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                                {u.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{u.name || '-'}</p>
                                {u.phone && <p className="text-xs text-gray-500">{u.phone}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                          <td className="px-4 py-3">
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200">{getRoleLabel(u.role)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {u.staff_link ? (
                              <span className="text-green-700 flex items-center gap-1"><UserCheck className="h-3 w-3" />{u.staff_link.employee_code} - {u.staff_link.designation || u.staff_link.department}</span>
                            ) : <span className="text-gray-400">Not linked</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-1">
                              {user?.role === 'super_admin' && (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => openRoleDialog(u)} data-testid={`edit-user-${u.user_id}`}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => { setSelectedUser(u); setNewPassword(''); setResetPwdDialog(true); }} data-testid={`reset-pwd-${u.user_id}`}>
                                    <Key className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteUser(u.user_id)} data-testid={`delete-user-${u.user_id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {user?.role === 'hr' && (
                                <span className="text-xs text-gray-400">View only</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ==================== ADD/EDIT EMPLOYEE DIALOG ==================== */}
      <Dialog open={staffDialog} onOpenChange={setStaffDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedStaff ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
            <DialogDescription>Fill in employee details across all sections below.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Personal Info */}
            <SectionHeader id="personal" label="Personal Information" icon={Users} />
            {expandedSection === 'personal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white rounded-lg border">
                <div><Label>Full Name *</Label><Input value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} data-testid="input-name" /></div>
                <div><Label>Email</Label><Input value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} data-testid="input-email" /></div>
                <div><Label>Phone</Label><Input value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} data-testid="input-phone" /></div>
                <div><Label>Date of Birth</Label><Input type="date" value={staffForm.date_of_birth} onChange={(e) => setStaffForm({ ...staffForm, date_of_birth: e.target.value })} data-testid="input-dob" /></div>
                <div>
                  <Label>Gender</Label>
                  <Select value={staffForm.gender} onValueChange={(v) => setStaffForm({ ...staffForm, gender: v })}>
                    <SelectTrigger data-testid="select-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Blood Group</Label>
                  <Select value={staffForm.blood_group} onValueChange={(v) => setStaffForm({ ...staffForm, blood_group: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{BLOOD_GROUPS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marital Status</Label>
                  <Select value={staffForm.marital_status} onValueChange={(v) => setStaffForm({ ...staffForm, marital_status: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Father's Name</Label><Input value={staffForm.father_name} onChange={(e) => setStaffForm({ ...staffForm, father_name: e.target.value })} /></div>
                <div><Label>Mother's Name</Label><Input value={staffForm.mother_name} onChange={(e) => setStaffForm({ ...staffForm, mother_name: e.target.value })} /></div>
              </div>
            )}

            {/* Employment Details */}
            <SectionHeader id="employment" label="Employment Details" icon={Briefcase} />
            {expandedSection === 'employment' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white rounded-lg border">
                <div>
                  <Label>Department</Label>
                  <Select value={staffForm.department} onValueChange={(v) => setStaffForm({ ...staffForm, department: v })}>
                    <SelectTrigger data-testid="select-department"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Designation</Label>
                  <Select value={staffForm.designation} onValueChange={(v) => setStaffForm({ ...staffForm, designation: v })}>
                    <SelectTrigger data-testid="select-designation"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{DESIGNATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Date of Joining</Label><Input type="date" value={staffForm.date_of_joining} onChange={(e) => setStaffForm({ ...staffForm, date_of_joining: e.target.value })} data-testid="input-doj" /></div>
                <div><Label>Qualification</Label><Input value={staffForm.qualification} onChange={(e) => setStaffForm({ ...staffForm, qualification: e.target.value })} /></div>
                <div><Label>Experience (Years)</Label><Input type="number" value={staffForm.experience_years} onChange={(e) => setStaffForm({ ...staffForm, experience_years: e.target.value })} /></div>
                <div><Label>Previous Employer</Label><Input value={staffForm.previous_employer} onChange={(e) => setStaffForm({ ...staffForm, previous_employer: e.target.value })} /></div>
              </div>
            )}

            {/* ID & Documents */}
            <SectionHeader id="documents" label="ID & Documents" icon={FileText} />
            {expandedSection === 'documents' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border">
                <div><Label>Aadhar Number</Label><Input value={staffForm.aadhar_number} onChange={(e) => setStaffForm({ ...staffForm, aadhar_number: e.target.value })} placeholder="XXXX XXXX XXXX" /></div>
                <div><Label>PAN Number</Label><Input value={staffForm.pan_number} onChange={(e) => setStaffForm({ ...staffForm, pan_number: e.target.value })} placeholder="ABCDE1234F" /></div>
                <div><Label>UAN Number</Label><Input value={staffForm.uan_number} onChange={(e) => setStaffForm({ ...staffForm, uan_number: e.target.value })} /></div>
                <div><Label>ESI Number</Label><Input value={staffForm.esi_number} onChange={(e) => setStaffForm({ ...staffForm, esi_number: e.target.value })} /></div>
                {selectedStaff && (
                  <div className="col-span-full flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => handleUploadDoc(selectedStaff.staff_id, 'photo')} data-testid="upload-photo"><Upload className="h-3 w-3 mr-1" />Upload Photo</Button>
                    <Button size="sm" variant="outline" onClick={() => handleUploadDoc(selectedStaff.staff_id, 'resume')} data-testid="upload-resume"><Upload className="h-3 w-3 mr-1" />Upload Resume</Button>
                    <Button size="sm" variant="outline" onClick={() => handleUploadDoc(selectedStaff.staff_id, 'aadhar')} data-testid="upload-aadhar"><Upload className="h-3 w-3 mr-1" />Upload Aadhar</Button>
                    <Button size="sm" variant="outline" onClick={() => handleUploadDoc(selectedStaff.staff_id, 'pan')} data-testid="upload-pan"><Upload className="h-3 w-3 mr-1" />Upload PAN</Button>
                  </div>
                )}
              </div>
            )}

            {/* Address & Emergency */}
            <SectionHeader id="address" label="Address & Emergency Contact" icon={Phone} />
            {expandedSection === 'address' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border">
                <div className="col-span-full"><Label>Current Address</Label><Textarea value={staffForm.current_address} onChange={(e) => setStaffForm({ ...staffForm, current_address: e.target.value })} rows={2} /></div>
                <div className="col-span-full"><Label>Permanent Address</Label><Textarea value={staffForm.permanent_address} onChange={(e) => setStaffForm({ ...staffForm, permanent_address: e.target.value })} rows={2} /></div>
                <div><Label>Emergency Contact Name</Label><Input value={staffForm.emergency_contact_name} onChange={(e) => setStaffForm({ ...staffForm, emergency_contact_name: e.target.value })} /></div>
                <div><Label>Relation</Label><Input value={staffForm.emergency_contact_relation} onChange={(e) => setStaffForm({ ...staffForm, emergency_contact_relation: e.target.value })} /></div>
                <div><Label>Emergency Phone</Label><Input value={staffForm.emergency_contact_phone || staffForm.emergency_contact} onChange={(e) => setStaffForm({ ...staffForm, emergency_contact_phone: e.target.value, emergency_contact: e.target.value })} /></div>
              </div>
            )}

            {/* Salary & Bank */}
            <SectionHeader id="salary" label="Salary & Bank Details" icon={CreditCard} />
            {expandedSection === 'salary' && (
              <div className="space-y-3 p-3 bg-white rounded-lg border">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><Label>Basic Salary</Label><NumericInput value={staffForm.basic_salary} onChange={(e) => setStaffForm({ ...staffForm, basic_salary: e.target.value })} data-testid="input-basic" /></div>
                  <div><Label>HRA</Label><NumericInput value={staffForm.hra} onChange={(e) => setStaffForm({ ...staffForm, hra: e.target.value })} /></div>
                  <div><Label>DA</Label><NumericInput value={staffForm.da} onChange={(e) => setStaffForm({ ...staffForm, da: e.target.value })} /></div>
                  <div><Label>TA</Label><NumericInput value={staffForm.ta} onChange={(e) => setStaffForm({ ...staffForm, ta: e.target.value })} /></div>
                  <div><Label>Other Allowances</Label><NumericInput value={staffForm.other_allowances} onChange={(e) => setStaffForm({ ...staffForm, other_allowances: e.target.value })} /></div>
                  <div className="bg-green-50 p-2 rounded flex flex-col justify-center"><span className="text-xs text-green-600">Gross</span><span className="font-bold text-green-700">{formatCurrency(salary.gross)}</span></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><Label>PF</Label><NumericInput value={staffForm.pf} onChange={(e) => setStaffForm({ ...staffForm, pf: e.target.value })} /></div>
                  <div><Label>ESI</Label><NumericInput value={staffForm.esi_val || staffForm.esi} onChange={(e) => setStaffForm({ ...staffForm, esi_val: e.target.value })} /></div>
                  <div><Label>Prof. Tax</Label><NumericInput value={staffForm.professional_tax} onChange={(e) => setStaffForm({ ...staffForm, professional_tax: e.target.value })} /></div>
                  <div><Label>TDS</Label><NumericInput value={staffForm.tds} onChange={(e) => setStaffForm({ ...staffForm, tds: e.target.value })} /></div>
                  <div><Label>Other Deductions</Label><NumericInput value={staffForm.other_deductions} onChange={(e) => setStaffForm({ ...staffForm, other_deductions: e.target.value })} /></div>
                  <div className="bg-red-50 p-2 rounded flex flex-col justify-center"><span className="text-xs text-red-600">Deductions</span><span className="font-bold text-red-700">-{formatCurrency(salary.deductions)}</span></div>
                </div>
                <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200">
                  <CardContent className="p-3 flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Net Salary</span>
                    <span className="text-xl font-bold text-emerald-700">{formatCurrency(salary.net)}</span>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><Label>Bank Name</Label><Input value={staffForm.bank_name} onChange={(e) => setStaffForm({ ...staffForm, bank_name: e.target.value })} /></div>
                  <div><Label>Account No</Label><Input value={staffForm.account_number} onChange={(e) => setStaffForm({ ...staffForm, account_number: e.target.value })} /></div>
                  <div><Label>IFSC</Label><Input value={staffForm.ifsc_code} onChange={(e) => setStaffForm({ ...staffForm, ifsc_code: e.target.value })} /></div>
                  <div>
                    <Label>Payment Method</Label>
                    <Select value={staffForm.payment_method} onValueChange={(v) => setStaffForm({ ...staffForm, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="p-3">
              <Label>Notes</Label>
              <Textarea value={staffForm.notes} onChange={(e) => setStaffForm({ ...staffForm, notes: e.target.value })} rows={2} placeholder="Any additional notes..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEmployee} className="bg-amber-600 hover:bg-amber-700" data-testid="save-employee-btn">
              <Check className="h-4 w-4 mr-1" /> {selectedStaff ? 'Update' : 'Add'} Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== VIEW EMPLOYEE DIALOG ==================== */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Employee Profile</DialogTitle>
          </DialogHeader>
          {viewingStaff && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-2xl">
                  {viewingStaff.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold">{viewingStaff.name}</h3>
                  <p className="text-gray-600">{viewingStaff.designation || '-'} | {viewingStaff.department || '-'}</p>
                  <p className="text-sm text-gray-500">Employee Code: {viewingStaff.employee_code}</p>
                </div>
                <Badge className={`ml-auto ${viewingStaff.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {viewingStaff.status || 'Active'}
                </Badge>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <InfoRow label="Email" value={viewingStaff.email} />
                <InfoRow label="Phone" value={viewingStaff.phone} />
                <InfoRow label="Date of Birth" value={viewingStaff.date_of_birth ? new Date(viewingStaff.date_of_birth).toLocaleDateString('en-IN') : null} />
                <InfoRow label="Gender" value={viewingStaff.gender} />
                <InfoRow label="Blood Group" value={viewingStaff.blood_group} />
                <InfoRow label="Marital Status" value={viewingStaff.marital_status} />
                <InfoRow label="Father's Name" value={viewingStaff.father_name} />
                <InfoRow label="Mother's Name" value={viewingStaff.mother_name} />
                <InfoRow label="Joining Date" value={viewingStaff.date_of_joining ? new Date(viewingStaff.date_of_joining).toLocaleDateString('en-IN') : null} />
                <InfoRow label="Qualification" value={viewingStaff.qualification} />
                <InfoRow label="Experience" value={viewingStaff.experience_years ? `${viewingStaff.experience_years} years` : null} />
                <InfoRow label="Previous Employer" value={viewingStaff.previous_employer} />
              </div>

              {/* ID Documents */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">ID & Documents</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Aadhar" value={viewingStaff.aadhar_number} />
                  <InfoRow label="PAN" value={viewingStaff.pan_number} />
                  <InfoRow label="UAN" value={viewingStaff.uan_number} />
                  <InfoRow label="ESI No" value={viewingStaff.esi_number} />
                </div>
                <div className="flex gap-2 mt-2">
                  {viewingStaff.profile_photo_id && <Badge variant="outline" className="text-xs">Photo uploaded</Badge>}
                  {viewingStaff.resume_file_id && <Badge variant="outline" className="text-xs">Resume uploaded</Badge>}
                  {viewingStaff.aadhar_doc_id && <Badge variant="outline" className="text-xs">Aadhar Doc</Badge>}
                  {viewingStaff.pan_doc_id && <Badge variant="outline" className="text-xs">PAN Doc</Badge>}
                </div>
              </div>

              {/* Address */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Address & Emergency</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <InfoRow label="Current Address" value={viewingStaff.current_address || viewingStaff.address} />
                  <InfoRow label="Permanent Address" value={viewingStaff.permanent_address} />
                  <InfoRow label="Emergency Contact" value={viewingStaff.emergency_contact_name ? `${viewingStaff.emergency_contact_name} (${viewingStaff.emergency_contact_relation || '-'}) - ${viewingStaff.emergency_contact_phone || viewingStaff.emergency_contact || '-'}` : viewingStaff.emergency_contact} />
                </div>
              </div>

              {/* Salary */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Salary Details</h4>
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Basic" value={formatCurrency(viewingStaff.basic_salary)} />
                  <InfoRow label="HRA" value={formatCurrency(viewingStaff.hra)} />
                  <InfoRow label="DA" value={formatCurrency(viewingStaff.da)} />
                  <InfoRow label="TA" value={formatCurrency(viewingStaff.ta)} />
                  <InfoRow label="Other Allow." value={formatCurrency(viewingStaff.other_allowances)} />
                  <InfoRow label="Gross" value={formatCurrency(viewingStaff.gross_salary)} className="font-bold text-green-700" />
                  <InfoRow label="PF" value={formatCurrency(viewingStaff.pf)} />
                  <InfoRow label="ESI" value={formatCurrency(viewingStaff.esi)} />
                  <InfoRow label="Prof. Tax" value={formatCurrency(viewingStaff.professional_tax)} />
                  <InfoRow label="TDS" value={formatCurrency(viewingStaff.tds)} />
                  <InfoRow label="Other Ded." value={formatCurrency(viewingStaff.other_deductions)} />
                  <InfoRow label="Net Salary" value={formatCurrency(viewingStaff.net_salary)} className="font-bold text-emerald-700 text-base" />
                </div>
              </div>

              {/* Bank */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Bank Details</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Bank" value={viewingStaff.bank_name} />
                  <InfoRow label="Account No" value={viewingStaff.account_number} />
                  <InfoRow label="IFSC" value={viewingStaff.ifsc_code} />
                  <InfoRow label="Payment Method" value={viewingStaff.payment_method?.replace(/_/g, ' ')} />
                </div>
              </div>

              {viewingStaff.notes && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Notes</h4>
                  <p className="text-sm text-gray-600">{viewingStaff.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog(false)}>Close</Button>
            <Button onClick={() => { setViewDialog(false); openEditEmployee(viewingStaff); }} className="bg-amber-600 hover:bg-amber-700">
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== EDIT USER ROLE DIALOG ==================== */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details, role and status.</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={selectedUser.newName || ''} onChange={(e) => setSelectedUser({ ...selectedUser, newName: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={selectedUser.email} disabled className="bg-gray-100" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={selectedUser.newPhone || ''} onChange={(e) => setSelectedUser({ ...selectedUser, newPhone: e.target.value })} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={selectedUser.newRole} onValueChange={(v) => setSelectedUser({ ...selectedUser, newRole: v })}>
                  <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
                  <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Label>Active</Label>
                <Button size="sm" variant={selectedUser.newActive ? 'default' : 'outline'} className={selectedUser.newActive ? 'bg-green-600' : ''} onClick={() => setSelectedUser({ ...selectedUser, newActive: !selectedUser.newActive })}>
                  {selectedUser.newActive ? 'Active' : 'Inactive'}
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateUser} className="bg-amber-600 hover:bg-amber-700" data-testid="save-user-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== RESET PASSWORD DIALOG ==================== */}
      <Dialog open={resetPwdDialog} onOpenChange={setResetPwdDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Reset password for {selectedUser?.name} ({selectedUser?.email})</DialogDescription>
          </DialogHeader>
          <div>
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" data-testid="input-new-password" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwdDialog(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} className="bg-red-600 hover:bg-red-700" data-testid="confirm-reset-pwd">Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CREATE USER DIALOG ==================== */}
      <Dialog open={createUserDialog} onOpenChange={setCreateUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
            <DialogDescription>Create login credentials for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Link to Employee (optional)</Label>
              <Select value={createUserForm.staff_id} onValueChange={(v) => {
                const emp = staff.find(s => s.staff_id === v);
                setCreateUserForm({
                  ...createUserForm,
                  staff_id: v === 'none' ? '' : v,
                  name: emp ? emp.name : createUserForm.name,
                  email: emp?.email ? emp.email : createUserForm.email
                });
              }}>
                <SelectTrigger data-testid="select-employee-link"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No employee link --</SelectItem>
                  {staff.filter(s => s.status === 'active').map(s => (
                    <SelectItem key={s.staff_id} value={s.staff_id}>
                      {s.employee_code} - {s.name} ({s.designation || s.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={createUserForm.name} onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })} placeholder="Full name" data-testid="create-user-name" />
            </div>
            <div>
              <Label>Username (Email) *</Label>
              <Input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })} placeholder="user@company.com" data-testid="create-user-email" />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={createUserForm.role} onValueChange={(v) => setCreateUserForm({ ...createUserForm, role: v })}>
                <SelectTrigger data-testid="select-user-role"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES
                    .filter(r => user?.role === 'super_admin' || !['super_admin', 'hr'].includes(r.value))
                    .map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={createUserForm.password} onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })} placeholder="Min 6 characters" data-testid="create-user-password" />
            </div>
            <div>
              <Label>Confirm Password *</Label>
              <Input type="password" value={createUserForm.confirm_password} onChange={(e) => setCreateUserForm({ ...createUserForm, confirm_password: e.target.value })} placeholder="Confirm password" data-testid="create-user-confirm-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} className="bg-blue-600 hover:bg-blue-700" data-testid="submit-create-user">Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}

function InfoRow({ label, value, className = '' }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-gray-900 ${className}`}>{value}</span>
    </div>
  );
}
