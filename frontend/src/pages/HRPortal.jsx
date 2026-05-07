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
  Users, UserPlus, Briefcase, Calendar, Edit, Trash2, Eye, EyeOff,
  Phone, Mail, CreditCard, FileText, Search, RefreshCw, Upload,
  Shield, Key, UserCheck, ChevronDown, ChevronUp, X, Check,
  Clock, MapPin, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Download, Calculator, Settings, AlertCircle, Timer, TrendingUp,
  UserX, Laptop, RefreshCcw
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEPARTMENTS = ['Sales', 'HR', 'Operations', 'Planning', 'Quality', 'Architecture', 'Purchase', 'Accounts', 'Marketing'];
const DESIGNATIONS = [
  'Presales Executive', 'Sales Executive', 'Senior Sales Executive', 'Sales Head',
  'Business Development Manager', 'CRM Executive', 'CRE (Customer Relationship Executive)',
  'General Manager', 'Project Manager', 'Assistant Project Manager',
  'Zone Incharge', 'Senior Site Engineer', 'Site Engineer', 'Junior Site Engineer', 'Site Supervisor',
  'Designing Manager', 'Architect Incharge', 'Senior Architect', 'Junior Architect', 'Draftsman',
  'Junior Quantity Surveyor', 'Senior Quantity Surveyor',
  'Planning Incharge', 'Planning Manager',
  'Accounts Manager', 'Senior Accountant', 'Accountant', 'Junior Accountant',
  'Purchase Manager', 'Purchase Executive', 'Assistant Purchase Executive', 'Procurement Officer',
  'Quality Manager', 'Quality Checking Incharge', 'Quality Checking Engineer',
  'HR Manager', 'HR Executive', 'HR Junior Executive',
  'Driver'
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
const LEAVE_TYPES = [
  { value: 'PL', label: 'Paid Leave', color: 'bg-blue-100 text-blue-700' },
  { value: 'SL', label: 'Sick Leave', color: 'bg-red-100 text-red-700' },
  { value: 'CL', label: 'Casual Leave', color: 'bg-orange-100 text-orange-700' },
  { value: 'WFH', label: 'Work From Home', color: 'bg-purple-100 text-purple-700' },
];
const ATT_STATUSES = [
  { value: 'P', label: 'Present', color: 'bg-green-500' },
  { value: 'PL', label: 'Paid Leave', color: 'bg-blue-500' },
  { value: 'SL', label: 'Sick Leave', color: 'bg-red-500' },
  { value: 'CL', label: 'Casual Leave', color: 'bg-orange-500' },
  { value: 'WFH', label: 'WFH', color: 'bg-purple-500' },
  { value: 'Halfday', label: 'Half Day', color: 'bg-yellow-500' },
  { value: 'A', label: 'Absent', color: 'bg-gray-500' },
];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
const getRoleLabel = (role) => ALL_ROLES.find(r => r.value === role)?.label || role?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '-';

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

export default function HRPortal() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Employee data
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [empSortBy, setEmpSortBy] = useState('name_asc');
  const [leftSortBy, setLeftSortBy] = useState('name_asc');
  const [userSortBy, setUserSortBy] = useState('name_asc');

  // Users data (Roles & Credentials)
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Employee Dialogs
  const [staffDialog, setStaffDialog] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
  const [viewingStaff, setViewingStaff] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffForm, setStaffForm] = useState(getEmptyForm());
  const [expandedSection, setExpandedSection] = useState('personal');
  const [empDialogTab, setEmpDialogTab] = useState('personal');

  // User Dialogs
  const [roleDialog, setRoleDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [resetPwdDialog, setResetPwdDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [createUserDialog, setCreateUserDialog] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ staff_id: '', email: '', password: '', confirm_password: '', role: '', name: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // CSV Import
  const [importDialog, setImportDialog] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importing, setImporting] = useState(false);

  // Attendance state
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1);
  const [attYear, setAttYear] = useState(new Date().getFullYear());
  const [monthlyAtt, setMonthlyAtt] = useState(null);
  const [markDialog, setMarkDialog] = useState(false);
  const [markData, setMarkData] = useState({ staff_id: '', date: '', status: 'P', remarks: '' });
  const [lateReport, setLateReport] = useState(null);

  // Leave state
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveFilter, setLeaveFilter] = useState('pending');

  // Payroll state
  const [payMonth, setPayMonth] = useState(new Date().getMonth() + 1);
  const [payYear, setPayYear] = useState(new Date().getFullYear());
  const [payrollData, setPayrollData] = useState([]);
  const [payslipDialog, setPayslipDialog] = useState(false);
  const [payslipData, setPayslipData] = useState(null);

  // Dashboard & Settings
  const [dashboardData, setDashboardData] = useState(null);
  const [hrSettings, setHrSettings] = useState(null);

  // Left/Terminated Employees
  const [terminatedStaff, setTerminatedStaff] = useState([]);
  const [empListView, setEmpListView] = useState('active'); // 'active' or 'left'
  const [viewLeaveHistory, setViewLeaveHistory] = useState(null);

  // ============ DATA FETCHING ============
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
      const [staffRes, usersRes, dashRes, settRes] = await Promise.allSettled([
        axios.get(`${API}/hr/staff`),
        axios.get(`${API}/hr/users`),
        axios.get(`${API}/hr/dashboard`),
        axios.get(`${API}/hr/settings`),
      ]);
      if (staffRes.status === 'fulfilled') setStaff(staffRes.value.data || []);
      if (usersRes.status === 'fulfilled') setAllUsers(usersRes.value.data || []);
      if (dashRes.status === 'fulfilled') setDashboardData(dashRes.value.data);
      if (settRes.status === 'fulfilled') setHrSettings(settRes.value.data);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);
  useAutoRefresh(fetchData, 15000);

  // ============ ATTENDANCE FETCHING ============
  const fetchMonthlyAttendance = async () => {
    try {
      const res = await axios.get(`${API}/hr/attendance/monthly?month=${attMonth}&year=${attYear}`);
      setMonthlyAtt(res.data);
    } catch { toast.error('Failed to load attendance'); }
  };
  const fetchLateReport = async () => {
    try { const res = await axios.get(`${API}/hr/attendance/late-report?month=${attMonth}&year=${attYear}`); setLateReport(res.data); } catch { /* silent */ }
  };
  const fetchLeaveRequests = async () => {
    try {
      const url = leaveFilter ? `${API}/hr/leave/requests?status=${leaveFilter}` : `${API}/hr/leave/requests`;
      setLeaveRequests((await axios.get(url)).data || []);
    } catch { toast.error('Failed to load leave requests'); }
  };
  const fetchPayroll = async () => {
    try { setPayrollData((await axios.get(`${API}/hr/salary/list?month=${payMonth}&year=${payYear}`)).data || []); } catch { /* silent */ }
  };

  useEffect(() => { if (activeTab === 'attendance') { fetchMonthlyAttendance(); fetchLateReport(); } }, [activeTab, attMonth, attYear]);
  useEffect(() => { if (activeTab === 'leave') fetchLeaveRequests(); }, [activeTab, leaveFilter]);
  useEffect(() => { if (activeTab === 'payroll') fetchPayroll(); }, [activeTab, payMonth, payYear]);
  useEffect(() => { if (activeTab === 'employees' && empListView === 'left') fetchTerminatedStaff(); }, [activeTab, empListView]);

  // ============ EMPLOYEE HANDLERS ============
  const openAddEmployee = () => { setSelectedStaff(null); setStaffForm(getEmptyForm()); setExpandedSection('personal'); setStaffDialog(true); };
  
  // CSV Import handlers
  // Proper RFC4180 parser — respects quoted commas, escaped quotes, CRLF, and
  // normalises common human-readable headers (e.g. "Date of Birth" → date_of_birth,
  // "Gross" → gross_salary, "Joining Date" → date_of_joining, "Current Address" → current_address).
  const parseCSVText = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (ch === '\r') { /* skip */ }
        else field += ch;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => (c || '').trim()));
  };
  // Map of user-friendly column names → canonical backend keys
  const HEADER_ALIASES = {
    'joining_date': 'date_of_joining',
    'date_of_joining': 'date_of_joining',
    'doj': 'date_of_joining',
    'date_of_birth': 'date_of_birth',
    'dob': 'date_of_birth',
    'birth_date': 'date_of_birth',
    'gross': 'gross_salary',
    'gross_salary': 'gross_salary',
    'basic': 'basic_salary',
    'basic_salary': 'basic_salary',
    'aadhar': 'aadhar_number',
    'aadhaar': 'aadhar_number',
    'aadhaar_number': 'aadhar_number',
    'aadhar_number': 'aadhar_number',
    'pan': 'pan_number',
    'pan_number': 'pan_number',
    'current_address': 'current_address',
    'present_address': 'current_address',
    'permanent_address': 'permanent_address',
    'address': 'address',
    'mobile': 'phone',
    'mobile_number': 'phone',
    'phone_number': 'phone',
    'email_id': 'email',
    'ifsc': 'ifsc_code',
    'account_no': 'account_number',
    'account_number': 'account_number',
    'bank': 'bank_name',
  };
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const parsed = parseCSVText(text);
      if (parsed.length < 2) { toast.error('CSV file is empty or has no data rows'); return; }
      const rawHeaders = parsed[0].map(h => (h || '').trim().toLowerCase().replace(/\s+/g, '_'));
      const headers = rawHeaders.map(h => HEADER_ALIASES[h] || h);
      const rows = [];
      for (let i = 1; i < parsed.length; i++) {
        const values = parsed[i];
        const row = {};
        headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
        if (row.name) rows.push(row);
      }
      setImportData(rows);
      toast.success(`Parsed ${rows.length} employees from CSV`);
    };
    reader.readAsText(file);
  };

  const handleBulkImport = async () => {
    if (!importData.length) return;
    setImporting(true);
    try {
      const res = await axios.post(`${API}/hr/staff/bulk-import`, { employees: importData });
      const { imported = 0, updated = 0, skipped_duplicates = 0, skipped_invalid = 0, errors = [], warnings = [] } = res.data;
      const summary = `Imported ${imported}` +
        (updated ? `, ${updated} updated` : '') +
        (skipped_duplicates ? `, ${skipped_duplicates} duplicate${skipped_duplicates > 1 ? 's' : ''} skipped` : '') +
        (skipped_invalid ? `, ${skipped_invalid} invalid row${skipped_invalid > 1 ? 's' : ''} rejected` : '') +
        (warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : '');
      toast.success(summary);
      // Hard errors → red toasts
      errors.forEach(err => toast.error(err));
      // Soft warnings → bundle into one info toast (capped) so we don't spam 50 toasts
      if (warnings.length) {
        const preview = warnings.slice(0, 5).join(' · ');
        const more = warnings.length > 5 ? ` …and ${warnings.length - 5} more` : '';
        toast.warning(`Some numeric fields were defaulted to 0: ${preview}${more}`, { duration: 8000 });
      }
      setImportDialog(false);
      setImportData([]);
      fetchData(false);
    } catch (err) {
      toast.error('Import failed: ' + (err.response?.data?.detail || err.message));
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const headers = 'name,email,phone,department,designation,date_of_joining,date_of_birth,gender,marital_status,blood_group,father_name,mother_name,address,aadhar_number,pan_number,basic_salary,hra,da,ta,other_allowances,pf,esi,professional_tax,tds,other_deductions,bank_name,account_number,ifsc_code,payment_method,notes';
    const sample = 'John Doe,john@company.com,9876543210,Sales,Sales Executive,2026-01-15,1995-05-20,Male,Single,O+,Father Name,Mother Name,123 Street City,123456789012,ABCDE1234F,25000,5000,2000,1500,1000,1800,750,200,0,0,SBI,1234567890,SBIN0001234,bank_transfer,New employee';
    const blob = new Blob([headers + '\n' + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'employee_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const openEditEmployee = (s) => {
    setSelectedStaff(s);
    setStaffForm({
      name: s.name || '', email: s.email || '', phone: s.phone || '',
      department: s.department || '', designation: s.designation || '',
      date_of_joining: s.date_of_joining?.split('T')[0] || '', date_of_birth: s.date_of_birth?.split('T')[0] || '',
      gender: s.gender || '', marital_status: s.marital_status || '',
      blood_group: s.blood_group || '', father_name: s.father_name || '', mother_name: s.mother_name || '',
      address: s.address || '', permanent_address: s.permanent_address || '', current_address: s.current_address || '',
      aadhar_number: s.aadhar_number || '', pan_number: s.pan_number || '', uan_number: s.uan_number || '', esi_number: s.esi_number || '',
      emergency_contact: s.emergency_contact || '', emergency_contact_name: s.emergency_contact_name || '',
      emergency_contact_relation: s.emergency_contact_relation || '', emergency_contact_phone: s.emergency_contact_phone || '',
      qualification: s.qualification || '', experience_years: s.experience_years?.toString() || '', previous_employer: s.previous_employer || '',
      basic_salary: s.basic_salary?.toString() || '', hra: s.hra?.toString() || '', da: s.da?.toString() || '',
      ta: s.ta?.toString() || '', other_allowances: s.other_allowances?.toString() || '',
      pf: s.pf?.toString() || '', esi_val: s.esi?.toString() || '', professional_tax: s.professional_tax?.toString() || '',
      tds: s.tds?.toString() || '', other_deductions: s.other_deductions?.toString() || '',
      bank_name: s.bank_name || '', account_number: s.account_number || '', ifsc_code: s.ifsc_code || '',
      payment_method: s.payment_method || 'bank_transfer', notes: s.notes || ''
    });
    setExpandedSection('personal'); setStaffDialog(true);
  };
  const openViewEmployee = (s) => { setViewingStaff(s); setViewDialog(true); };

  const handleSaveEmployee = async () => {
    if (!staffForm.name) { toast.error('Name is required'); return; }
    try {
      const payload = {
        ...staffForm,
        basic_salary: parseFloat(staffForm.basic_salary) || 0, hra: parseFloat(staffForm.hra) || 0,
        da: parseFloat(staffForm.da) || 0, ta: parseFloat(staffForm.ta) || 0,
        other_allowances: parseFloat(staffForm.other_allowances) || 0, pf: parseFloat(staffForm.pf) || 0,
        esi: parseFloat(staffForm.esi_val || staffForm.esi) || 0, professional_tax: parseFloat(staffForm.professional_tax) || 0,
        tds: parseFloat(staffForm.tds) || 0, other_deductions: parseFloat(staffForm.other_deductions) || 0,
        experience_years: parseFloat(staffForm.experience_years) || 0,
        date_of_joining: staffForm.date_of_joining ? new Date(staffForm.date_of_joining).toISOString() : null,
        date_of_birth: staffForm.date_of_birth ? new Date(staffForm.date_of_birth).toISOString() : null
      };
      if (selectedStaff) {
        await axios.patch(`${API}/hr/staff/${selectedStaff.staff_id}`, payload);
        const profileFields = {
          father_name: staffForm.father_name, mother_name: staffForm.mother_name,
          blood_group: staffForm.blood_group, gender: staffForm.gender, marital_status: staffForm.marital_status,
          aadhar_number: staffForm.aadhar_number, pan_number: staffForm.pan_number,
          uan_number: staffForm.uan_number, esi_number: staffForm.esi_number,
          permanent_address: staffForm.permanent_address, current_address: staffForm.current_address,
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
      setStaffDialog(false); fetchData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to save'); }
  };

  const handleUploadDoc = async (staffId, docType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = docType === 'photo' ? 'image/*' : '.pdf,.doc,.docx,.jpg,.jpeg,.png';
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const formData = new FormData(); formData.append('file', file); formData.append('doc_type', docType);
      try { await axios.post(`${API}/hr/staff/${staffId}/upload-document`, formData); toast.success(`${docType} uploaded`); fetchData(false); }
      catch { toast.error('Upload failed'); }
    };
    input.click();
  };

  const handleTerminate = async (staffId) => {
    if (!confirm('Are you sure you want to terminate this employee? They will be moved to "Left Employees" history.')) return;
    try {
      await axios.delete(`${API}/hr/staff/${staffId}`);
      toast.success('Employee terminated and moved to Left Employees');
      fetchData(false);
      fetchTerminatedStaff();
    }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to terminate'); }
  };

  const fetchTerminatedStaff = async () => {
    try {
      const res = await axios.get(`${API}/hr/terminated-staff`);
      setTerminatedStaff(res.data);
    } catch { /* silent */ }
  };

  const handlePermanentDelete = async (staffId, name) => {
    if (!confirm(`PERMANENTLY DELETE "${name}"? This will remove all their records (attendance, leave history) and CANNOT be undone.`)) return;
    try {
      await axios.delete(`${API}/hr/staff/${staffId}/permanent`);
      toast.success(`${name} permanently deleted`);
      fetchTerminatedStaff();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  // ============ ROLE/CREDENTIALS HANDLERS ============
  const openRoleDialog = (u) => { setSelectedUser({ ...u, newRole: u.role, newActive: u.is_active, newName: u.name, newPhone: u.phone || '', newEmail: u.email }); setRoleDialog(true); };
  const handleUpdateUser = async () => {
    try {
      await axios.patch(`${API}/hr/users/${selectedUser.user_id}/update-role`, {
        role: selectedUser.newRole, is_active: selectedUser.newActive, name: selectedUser.newName, phone: selectedUser.newPhone, email: selectedUser.newEmail
      });
      toast.success('User updated'); setRoleDialog(false); fetchData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update'); }
  };
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try { await axios.post(`${API}/hr/users/${selectedUser.user_id}/reset-password`, { new_password: newPassword }); toast.success('Password reset'); setResetPwdDialog(false); setNewPassword(''); }
    catch { toast.error('Failed to reset password'); }
  };
  const handleCreateUser = async () => {
    if (!createUserForm.email || !createUserForm.password || !createUserForm.role) { toast.error('Email, password and role are required'); return; }
    if (createUserForm.password !== createUserForm.confirm_password) { toast.error('Passwords do not match'); return; }
    if (createUserForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      await axios.post(`${API}/hr/users/create`, {
        email: createUserForm.email, password: createUserForm.password, confirm_password: createUserForm.confirm_password,
        role: createUserForm.role, staff_id: createUserForm.staff_id || null, name: createUserForm.name || ''
      });
      toast.success('User created'); setCreateUserDialog(false);
      setCreateUserForm({ staff_id: '', email: '', password: '', confirm_password: '', role: '', name: '' });
      setShowPassword(false); setShowConfirmPassword(false); fetchData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create user'); }
  };
  const handleDeleteUser = async (userId) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try { await axios.delete(`${API}/hr/users/${userId}`); toast.success('User deleted'); fetchData(false); }
    catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete user'); }
  };

  // ============ ATTENDANCE/LEAVE/PAYROLL HANDLERS ============
  const handleMarkAttendance = async () => {
    try { await axios.post(`${API}/hr/attendance/mark`, markData); toast.success('Attendance marked'); setMarkDialog(false); fetchMonthlyAttendance(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleLeaveAction = async (leaveId, action) => {
    try { await axios.patch(`${API}/hr/leave/${leaveId}/action`, { action }); toast.success(`Leave ${action}d`); fetchLeaveRequests(); }
    catch { toast.error('Failed'); }
  };
  const handleCalculateSalary = async () => {
    try {
      toast.info('Calculating salaries...');
      const res = await axios.post(`${API}/hr/salary/calculate`, { month: payMonth, year: payYear });
      setPayrollData(res.data.payroll || []);
      toast.success(`Salary calculated for ${res.data.payroll?.length || 0} employees`);
    } catch { toast.error('Calculation failed'); }
  };
  const openPayslip = async (staffId) => {
    try { const res = await axios.get(`${API}/hr/payslip/${staffId}?month=${payMonth}&year=${payYear}`); setPayslipData(res.data); setPayslipDialog(true); }
    catch { toast.error('Payslip not found'); }
  };
  const handleSaveSettings = async () => {
    try { await axios.patch(`${API}/hr/settings`, hrSettings); toast.success('Settings saved'); }
    catch { toast.error('Failed to save'); }
  };

  // ============ FILTERS & COMPUTED ============
  const filteredStaff = staff.filter(s => {
    if (s.status !== 'active') return false;
    const matchSearch = !searchTerm || s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone?.includes(searchTerm);
    const matchDept = !departmentFilter || s.department === departmentFilter;
    return matchSearch && matchDept;
  }).sort((a, b) => {
    switch (empSortBy) {
      case 'name_asc': return (a.name || '').localeCompare(b.name || '');
      case 'name_desc': return (b.name || '').localeCompare(a.name || '');
      case 'salary_high': return (b.net_salary || 0) - (a.net_salary || 0);
      case 'salary_low': return (a.net_salary || 0) - (b.net_salary || 0);
      case 'service_old': return (a.date_of_joining || '').localeCompare(b.date_of_joining || '');
      case 'service_new': return (b.date_of_joining || '').localeCompare(a.date_of_joining || '');
      default: return 0;
    }
  });
  const filteredUsers = allUsers.filter(u => {
    const matchSearch = !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase());
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  }).sort((a, b) => {
    switch (userSortBy) {
      case 'name_asc': return (a.name || '').localeCompare(b.name || '');
      case 'name_desc': return (b.name || '').localeCompare(a.name || '');
      case 'role_asc': return (a.role || '').localeCompare(b.role || '');
      case 'role_desc': return (b.role || '').localeCompare(a.role || '');
      default: return 0;
    }
  });
  const salary = (() => {
    const gross = ['basic_salary', 'hra', 'da', 'ta', 'other_allowances'].reduce((s, k) => s + (parseFloat(staffForm[k]) || 0), 0);
    const ded = ['pf', 'professional_tax', 'tds', 'other_deductions'].reduce((s, k) => s + (parseFloat(staffForm[k]) || 0), 0) + (parseFloat(staffForm.esi_val || staffForm.esi) || 0);
    return { gross, deductions: ded, net: gross - ded };
  })();
  const activeCount = staff.filter(s => s.status === 'active').length;
  const totalBudget = staff.filter(s => s.status === 'active').reduce((s, e) => s + (e.net_salary || 0), 0);

  if (loading && !user) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;

  const SectionHeader = ({ id, label, icon: Icon }) => (
    <button onClick={() => setExpandedSection(expandedSection === id ? '' : id)} className="flex items-center justify-between w-full py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors" type="button">
      <span className="flex items-center gap-2 font-semibold text-sm text-gray-700"><Icon className="h-4 w-4 text-amber-600" />{label}</span>
      {expandedSection === id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50" data-testid="hr-portal">
      <AppHeader user={user} />
      <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="hr-portal-title">HR Admin</h1>
            <p className="text-sm text-gray-500">Manage employees, attendance, leave & payroll</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 flex flex-wrap gap-1">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard"><TrendingUp className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="employees" data-testid="tab-employees"><Users className="h-4 w-4 mr-1" />Employees</TabsTrigger>
            <TabsTrigger value="credentials" data-testid="tab-credentials"><Shield className="h-4 w-4 mr-1" />Roles & Credentials</TabsTrigger>
            <TabsTrigger value="attendance" data-testid="tab-attendance"><Calendar className="h-4 w-4 mr-1" />Attendance</TabsTrigger>
            <TabsTrigger value="leave" data-testid="tab-leave"><FileText className="h-4 w-4 mr-1" />Leave</TabsTrigger>
            <TabsTrigger value="payroll" data-testid="tab-payroll"><Calculator className="h-4 w-4 mr-1" />Payroll</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings"><Settings className="h-4 w-4 mr-1" />Settings</TabsTrigger>
          </TabsList>

          {/* ===== DASHBOARD TAB ===== */}
          <TabsContent value="dashboard">
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Active Employees', value: activeCount, icon: Users, color: 'border-l-amber-500' },
                  { label: 'Total Users', value: allUsers.length, icon: Shield, color: 'border-l-blue-500' },
                  { label: 'Present Today', value: dashboardData?.today_present || 0, icon: CheckCircle2, color: 'border-l-green-500' },
                  { label: 'Late Today', value: dashboardData?.today_late || 0, icon: Timer, color: 'border-l-orange-500' },
                  { label: 'Pending Leaves', value: dashboardData?.pending_leaves || 0, icon: AlertCircle, color: 'border-l-purple-500' },
                ].map((c, i) => (
                  <Card key={i} className={`border-l-4 ${c.color}`} data-testid={`dash-card-${i}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <c.icon className="h-5 w-5 text-gray-500" />
                      <div><p className="text-xs text-gray-500">{c.label}</p><p className="text-xl font-bold">{c.value}</p></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4"><p className="text-xs text-gray-500">Monthly Salary Budget</p><p className="text-xl font-bold text-green-700">{fmt(totalBudget)}</p></CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4"><p className="text-xs text-gray-500">Departments</p><p className="text-xl font-bold">{new Set(staff.map(s => s.department).filter(Boolean)).size}</p></CardContent>
                </Card>
              </div>
              {dashboardData?.department_counts && Object.keys(dashboardData.department_counts).length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Department Strength</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {Object.entries(dashboardData.department_counts).map(([dept, count]) => (
                        <div key={dept} className="p-3 bg-gray-50 rounded-lg text-center">
                          <p className="text-sm font-medium text-gray-700">{dept || 'Unassigned'}</p>
                          <p className="text-lg font-bold text-amber-600">{count}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ===== EMPLOYEE PROFILES TAB ===== */}
          <TabsContent value="employees">
            {/* Active / Left Employees Toggle */}
            <div className="flex gap-2 mb-4">
              <Button variant={empListView === 'active' ? 'default' : 'outline'} onClick={() => setEmpListView('active')} data-testid="emp-view-active" className={empListView === 'active' ? 'bg-amber-600 hover:bg-amber-700' : ''}>
                <Users className="h-4 w-4 mr-1" /> Active Employees ({staff.filter(s => s.status === 'active').length})
              </Button>
              <Button variant={empListView === 'left' ? 'default' : 'outline'} onClick={() => setEmpListView('left')} data-testid="emp-view-left" className={empListView === 'left' ? 'bg-red-600 hover:bg-red-700' : ''}>
                <UserX className="h-4 w-4 mr-1" /> Left Employees ({terminatedStaff.length})
              </Button>
            </div>

            {empListView === 'active' ? (
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
                      <SelectTrigger className="w-40" data-testid="filter-department"><SelectValue placeholder="All Depts" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={empSortBy} onValueChange={setEmpSortBy}>
                      <SelectTrigger className="w-44" data-testid="sort-employees"><SelectValue placeholder="Sort By" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name_asc">Name (A to Z)</SelectItem>
                        <SelectItem value="name_desc">Name (Z to A)</SelectItem>
                        <SelectItem value="salary_high">Salary (High to Low)</SelectItem>
                        <SelectItem value="salary_low">Salary (Low to High)</SelectItem>
                        <SelectItem value="service_old">Service (Oldest First)</SelectItem>
                        <SelectItem value="service_new">Service (Newest First)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={openAddEmployee} className="bg-amber-600 hover:bg-amber-700" data-testid="add-employee-btn">
                      <UserPlus className="h-4 w-4 mr-1" /> Add Employee
                    </Button>
                    <Button onClick={() => setImportDialog(true)} variant="outline" className="border-amber-600 text-amber-600 hover:bg-amber-50" data-testid="import-employees-btn">
                      <Upload className="h-4 w-4 mr-1" /> Import CSV
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESIGNATION</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CONTACT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">JOINING DATE</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">NET SALARY</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredStaff.length === 0 ? (
                        <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No employees found. Click "Add Employee" to get started.</td></tr>
                      ) : filteredStaff.map(s => (
                        <tr key={s.staff_id} className="hover:bg-gray-50/80 cursor-pointer" data-testid={`employee-row-${s.staff_id}`} onClick={() => openViewEmployee(s)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">{s.name?.charAt(0)?.toUpperCase()}</div>
                              <div><p className="font-medium text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{s.employee_code}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.department || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.designation || '-'}</td>
                          <td className="px-4 py-3"><div className="text-sm">{s.email && <p className="text-gray-600 flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</p>}{s.phone && <p className="text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>}</div></td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.date_of_joining ? new Date(s.date_of_joining).toLocaleDateString('en-IN') : '-'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(s.net_salary)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={s.status === 'active' ? 'bg-green-100 text-green-700' : s.status === 'terminated' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>{s.status?.replace(/_/g, ' ') || 'Active'}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openViewEmployee(s)} data-testid={`view-employee-${s.staff_id}`}><Eye className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openEditEmployee(s)} data-testid={`edit-employee-${s.staff_id}`}><Edit className="h-4 w-4" /></Button>
                              {s.status === 'active' && (<Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleTerminate(s.staff_id)} data-testid={`terminate-${s.staff_id}`}><Trash2 className="h-4 w-4" /></Button>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            ) : (
            /* ===== LEFT EMPLOYEES HISTORY ===== */
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-lg text-red-700" data-testid="left-employees-title">Left / Terminated Employees History</CardTitle>
                  <Select value={leftSortBy} onValueChange={setLeftSortBy}>
                    <SelectTrigger className="w-44" data-testid="sort-left-employees"><SelectValue placeholder="Sort By" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name_asc">Name (A to Z)</SelectItem>
                      <SelectItem value="name_desc">Name (Z to A)</SelectItem>
                      <SelectItem value="salary_high">Salary (High to Low)</SelectItem>
                      <SelectItem value="salary_low">Salary (Low to High)</SelectItem>
                      <SelectItem value="service_old">Service (Oldest First)</SelectItem>
                      <SelectItem value="service_new">Service (Newest First)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-red-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">EMPLOYEE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DEPARTMENT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESIGNATION</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">JOINED</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">TERMINATED</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ATTENDANCE DAYS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">LEAVES</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {terminatedStaff.length === 0 ? (
                        <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No terminated employees found.</td></tr>
                      ) : [...terminatedStaff].sort((a, b) => {
                        switch (leftSortBy) {
                          case 'name_asc': return (a.name || '').localeCompare(b.name || '');
                          case 'name_desc': return (b.name || '').localeCompare(a.name || '');
                          case 'salary_high': return (b.net_salary || 0) - (a.net_salary || 0);
                          case 'salary_low': return (a.net_salary || 0) - (b.net_salary || 0);
                          case 'service_old': return (a.date_of_joining || '').localeCompare(b.date_of_joining || '');
                          case 'service_new': return (b.date_of_joining || '').localeCompare(a.date_of_joining || '');
                          default: return 0;
                        }
                      }).map(s => (
                        <tr key={s.staff_id} className="hover:bg-red-50/50" data-testid={`left-employee-row-${s.staff_id}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">{s.name?.charAt(0)?.toUpperCase()}</div>
                              <div><p className="font-medium text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{s.employee_code}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.department || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.designation || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.date_of_joining ? new Date(s.date_of_joining).toLocaleDateString('en-IN') : '-'}</td>
                          <td className="px-4 py-3 text-sm text-red-600 font-medium">{s.terminated_at ? new Date(s.terminated_at).toLocaleDateString('en-IN') : '-'}</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold">{s.total_attendance_days || 0}</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold">{s.leave_history?.length || 0}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openViewEmployee(s)} data-testid={`view-left-${s.staff_id}`}><Eye className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 h-7 px-2 text-xs" onClick={() => setViewLeaveHistory(s)} data-testid={`leave-history-${s.staff_id}`}>
                                <FileText className="h-3 w-3 mr-1" />Leave History
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-800 hover:bg-red-50" onClick={() => handlePermanentDelete(s.staff_id, s.name)} data-testid={`perm-delete-${s.staff_id}`} title="Permanently Delete">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            )}
          </TabsContent>

          {/* ===== ROLES & CREDENTIALS TAB ===== */}
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
                      <SelectTrigger className="w-40" data-testid="filter-role"><SelectValue placeholder="All Roles" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {ALL_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={userSortBy} onValueChange={setUserSortBy}>
                      <SelectTrigger className="w-44" data-testid="sort-users"><SelectValue placeholder="Sort By" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name_asc">Name (A to Z)</SelectItem>
                        <SelectItem value="name_desc">Name (Z to A)</SelectItem>
                        <SelectItem value="role_asc">Role (A to Z)</SelectItem>
                        <SelectItem value="role_desc">Role (Z to A)</SelectItem>
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
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">{u.name?.charAt(0)?.toUpperCase() || '?'}</div>
                              <div><p className="font-medium text-gray-900">{u.name || '-'}</p>{u.phone && <p className="text-xs text-gray-500">{u.phone}</p>}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                          <td className="px-4 py-3"><Badge className="bg-blue-50 text-blue-700 border border-blue-200">{getRoleLabel(u.role)}</Badge></td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {u.staff_link ? (<span className="text-green-700 flex items-center gap-1"><UserCheck className="h-3 w-3" />{u.staff_link.employee_code} - {u.staff_link.designation || u.staff_link.department}</span>) : <span className="text-gray-400">Not linked</span>}
                          </td>
                          <td className="px-4 py-3 text-center"><Badge className={u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-1">
                              {user?.role === 'super_admin' && (<>
                                <Button size="sm" variant="ghost" onClick={() => openRoleDialog(u)} data-testid={`edit-user-${u.user_id}`}><Edit className="h-4 w-4" /></Button>
                                <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => { setSelectedUser(u); setNewPassword(''); setResetPwdDialog(true); }} data-testid={`reset-pwd-${u.user_id}`}><Key className="h-4 w-4" /></Button>
                                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteUser(u.user_id)} data-testid={`delete-user-${u.user_id}`}><Trash2 className="h-4 w-4" /></Button>
                              </>)}
                              {user?.role === 'hr' && (
                                <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => { setSelectedUser(u); setNewPassword(''); setResetPwdDialog(true); }} data-testid={`reset-pwd-hr-${u.user_id}`} title="Reset Password"><Key className="h-4 w-4" /></Button>
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

          {/* ===== ATTENDANCE TAB ===== */}
          <TabsContent value="attendance">
            <AttendanceTab monthlyAtt={monthlyAtt} attMonth={attMonth} attYear={attYear} setAttMonth={setAttMonth} setAttYear={setAttYear}
              onMarkClick={(staffId, date) => { setMarkData({ staff_id: staffId, date, status: 'P', remarks: '' }); setMarkDialog(true); }}
              lateReport={lateReport} />
          </TabsContent>

          {/* ===== LEAVE TAB ===== */}
          <TabsContent value="leave">
            <LeaveTab requests={leaveRequests} filter={leaveFilter} setFilter={setLeaveFilter} onAction={handleLeaveAction} />
          </TabsContent>

          {/* ===== PAYROLL TAB ===== */}
          <TabsContent value="payroll">
            <PayrollTab data={payrollData} month={payMonth} year={payYear} setMonth={setPayMonth} setYear={setPayYear} onCalculate={handleCalculateSalary} onViewPayslip={openPayslip} />
          </TabsContent>

          {/* ===== SETTINGS TAB ===== */}
          <TabsContent value="settings">
            <SettingsTab settings={hrSettings} setSettings={setHrSettings} onSave={handleSaveSettings} user={user} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ==================== ADD/EDIT EMPLOYEE DIALOG ==================== */}
      <Dialog open={staffDialog} onOpenChange={(v) => { setStaffDialog(v); if (v) setEmpDialogTab('personal'); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedStaff ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
            <DialogDescription>Fill in employee details across all sections below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-1 border-b pb-1">
              {[
                { id: 'personal', label: 'Personal', icon: Users },
                { id: 'employment', label: 'Employment', icon: Briefcase },
                { id: 'documents', label: 'ID & Docs', icon: FileText },
                { id: 'address', label: 'Address & Emergency', icon: Phone },
                { id: 'salary', label: 'Salary & Bank', icon: CreditCard },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEmpDialogTab(tab.id)}
                  data-testid={`emp-tab-${tab.id}`}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors ${empDialogTab === tab.id ? 'bg-amber-50 text-amber-700 border border-b-0 border-amber-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Personal Information Tab */}
            {empDialogTab === 'personal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white rounded-lg border">
                <div><Label>Full Name *</Label><Input value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} data-testid="input-name" /></div>
                <div><Label>Email</Label><Input value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} data-testid="input-email" /></div>
                <div><Label>Phone</Label><Input value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} data-testid="input-phone" /></div>
                <div><Label>Date of Birth</Label><Input type="date" value={staffForm.date_of_birth} onChange={(e) => setStaffForm({ ...staffForm, date_of_birth: e.target.value })} data-testid="input-dob" /></div>
                <div><Label>Gender</Label><Select value={staffForm.gender} onValueChange={(v) => setStaffForm({ ...staffForm, gender: v })}><SelectTrigger data-testid="select-gender"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Blood Group</Label><Select value={staffForm.blood_group} onValueChange={(v) => setStaffForm({ ...staffForm, blood_group: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{BLOOD_GROUPS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Marital Status</Label><Select value={staffForm.marital_status} onValueChange={(v) => setStaffForm({ ...staffForm, marital_status: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Father's Name</Label><Input value={staffForm.father_name} onChange={(e) => setStaffForm({ ...staffForm, father_name: e.target.value })} /></div>
                <div><Label>Mother's Name</Label><Input value={staffForm.mother_name} onChange={(e) => setStaffForm({ ...staffForm, mother_name: e.target.value })} /></div>
              </div>
            )}

            {/* Employment Details Tab */}
            {empDialogTab === 'employment' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white rounded-lg border">
                <div><Label>Department</Label><Select value={staffForm.department} onValueChange={(v) => setStaffForm({ ...staffForm, department: v })}><SelectTrigger data-testid="select-department"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Designation</Label><Select value={staffForm.designation} onValueChange={(v) => setStaffForm({ ...staffForm, designation: v })}><SelectTrigger data-testid="select-designation"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{DESIGNATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Date of Joining</Label><Input type="date" value={staffForm.date_of_joining} onChange={(e) => setStaffForm({ ...staffForm, date_of_joining: e.target.value })} data-testid="input-doj" /></div>
                <div><Label>Qualification</Label><Input value={staffForm.qualification} onChange={(e) => setStaffForm({ ...staffForm, qualification: e.target.value })} /></div>
                <div><Label>Experience (Years)</Label><Input type="number" value={staffForm.experience_years} onChange={(e) => setStaffForm({ ...staffForm, experience_years: e.target.value })} /></div>
                <div><Label>Previous Employer</Label><Input value={staffForm.previous_employer} onChange={(e) => setStaffForm({ ...staffForm, previous_employer: e.target.value })} /></div>
              </div>
            )}

            {/* ID & Documents Tab */}
            {empDialogTab === 'documents' && (
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

            {/* Address & Emergency Contact Tab */}
            {empDialogTab === 'address' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border">
                <div className="col-span-full"><Label>Current Address</Label><Textarea value={staffForm.current_address} onChange={(e) => setStaffForm({ ...staffForm, current_address: e.target.value })} rows={2} /></div>
                <div className="col-span-full"><Label>Permanent Address</Label><Textarea value={staffForm.permanent_address} onChange={(e) => setStaffForm({ ...staffForm, permanent_address: e.target.value })} rows={2} /></div>
                <div><Label>Emergency Contact Name</Label><Input value={staffForm.emergency_contact_name} onChange={(e) => setStaffForm({ ...staffForm, emergency_contact_name: e.target.value })} /></div>
                <div><Label>Relation</Label><Input value={staffForm.emergency_contact_relation} onChange={(e) => setStaffForm({ ...staffForm, emergency_contact_relation: e.target.value })} /></div>
                <div><Label>Emergency Phone</Label><Input value={staffForm.emergency_contact_phone || staffForm.emergency_contact} onChange={(e) => setStaffForm({ ...staffForm, emergency_contact_phone: e.target.value, emergency_contact: e.target.value })} /></div>
              </div>
            )}

            {/* Salary & Bank Details Tab */}
            {empDialogTab === 'salary' && (
              <div className="space-y-3 p-3 bg-white rounded-lg border">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><Label>Basic Salary</Label><NumericInput value={staffForm.basic_salary} onChange={(e) => setStaffForm({ ...staffForm, basic_salary: e.target.value })} data-testid="input-basic" /></div>
                  <div><Label>HRA</Label><NumericInput value={staffForm.hra} onChange={(e) => setStaffForm({ ...staffForm, hra: e.target.value })} /></div>
                  <div><Label>DA</Label><NumericInput value={staffForm.da} onChange={(e) => setStaffForm({ ...staffForm, da: e.target.value })} /></div>
                  <div><Label>TA</Label><NumericInput value={staffForm.ta} onChange={(e) => setStaffForm({ ...staffForm, ta: e.target.value })} /></div>
                  <div><Label>Other Allowances</Label><NumericInput value={staffForm.other_allowances} onChange={(e) => setStaffForm({ ...staffForm, other_allowances: e.target.value })} /></div>
                  <div className="bg-green-50 p-2 rounded flex flex-col justify-center"><span className="text-xs text-green-600">Gross</span><span className="font-bold text-green-700">{fmt(salary.gross)}</span></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><Label>PF</Label><NumericInput value={staffForm.pf} onChange={(e) => setStaffForm({ ...staffForm, pf: e.target.value })} /></div>
                  <div><Label>ESI</Label><NumericInput value={staffForm.esi_val || staffForm.esi} onChange={(e) => setStaffForm({ ...staffForm, esi_val: e.target.value })} /></div>
                  <div><Label>Prof. Tax</Label><NumericInput value={staffForm.professional_tax} onChange={(e) => setStaffForm({ ...staffForm, professional_tax: e.target.value })} /></div>
                  <div><Label>TDS</Label><NumericInput value={staffForm.tds} onChange={(e) => setStaffForm({ ...staffForm, tds: e.target.value })} /></div>
                  <div><Label>Other Deductions</Label><NumericInput value={staffForm.other_deductions} onChange={(e) => setStaffForm({ ...staffForm, other_deductions: e.target.value })} /></div>
                  <div className="bg-red-50 p-2 rounded flex flex-col justify-center"><span className="text-xs text-red-600">Deductions</span><span className="font-bold text-red-700">-{fmt(salary.deductions)}</span></div>
                </div>
                <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200">
                  <CardContent className="p-3 flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Net Salary</span>
                    <span className="text-xl font-bold text-emerald-700">{fmt(salary.net)}</span>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><Label>Bank Name</Label><Input value={staffForm.bank_name} onChange={(e) => setStaffForm({ ...staffForm, bank_name: e.target.value })} /></div>
                  <div><Label>Account No</Label><Input value={staffForm.account_number} onChange={(e) => setStaffForm({ ...staffForm, account_number: e.target.value })} /></div>
                  <div><Label>IFSC</Label><Input value={staffForm.ifsc_code} onChange={(e) => setStaffForm({ ...staffForm, ifsc_code: e.target.value })} /></div>
                  <div><Label>Payment Method</Label><Select value={staffForm.payment_method} onValueChange={(v) => setStaffForm({ ...staffForm, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
              </div>
            )}

            <div className="p-3"><Label>Notes</Label><Textarea value={staffForm.notes} onChange={(e) => setStaffForm({ ...staffForm, notes: e.target.value })} rows={2} placeholder="Any additional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEmployee} className="bg-amber-600 hover:bg-amber-700" data-testid="save-employee-btn"><Check className="h-4 w-4 mr-1" /> {selectedStaff ? 'Update' : 'Add'} Employee</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== VIEW EMPLOYEE DIALOG ==================== */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Employee Profile</DialogTitle></DialogHeader>
          {viewingStaff && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-2xl">{viewingStaff.name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <h3 className="text-xl font-bold">{viewingStaff.name}</h3>
                  <p className="text-gray-600">{viewingStaff.designation || '-'} | {viewingStaff.department || '-'}</p>
                  <p className="text-sm text-gray-500">Employee Code: {viewingStaff.employee_code}</p>
                </div>
                <Badge className={`ml-auto ${viewingStaff.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{viewingStaff.status || 'Active'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <InfoRow label="Email" value={viewingStaff.email} /><InfoRow label="Phone" value={viewingStaff.phone} />
                <InfoRow label="Date of Birth" value={viewingStaff.date_of_birth ? new Date(viewingStaff.date_of_birth).toLocaleDateString('en-IN') : null} />
                <InfoRow label="Gender" value={viewingStaff.gender} /><InfoRow label="Blood Group" value={viewingStaff.blood_group} />
                <InfoRow label="Marital Status" value={viewingStaff.marital_status} /><InfoRow label="Father's Name" value={viewingStaff.father_name} />
                <InfoRow label="Mother's Name" value={viewingStaff.mother_name} />
                <InfoRow label="Joining Date" value={viewingStaff.date_of_joining ? new Date(viewingStaff.date_of_joining).toLocaleDateString('en-IN') : null} />
                <InfoRow label="Qualification" value={viewingStaff.qualification} />
                <InfoRow label="Experience" value={viewingStaff.experience_years ? `${viewingStaff.experience_years} years` : null} />
                <InfoRow label="Previous Employer" value={viewingStaff.previous_employer} />
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">ID & Documents</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Aadhar" value={viewingStaff.aadhar_number} /><InfoRow label="PAN" value={viewingStaff.pan_number} />
                  <InfoRow label="UAN" value={viewingStaff.uan_number} /><InfoRow label="ESI No" value={viewingStaff.esi_number} />
                </div>
                <div className="flex gap-2 mt-2">
                  {viewingStaff.profile_photo_id && <Badge variant="outline" className="text-xs">Photo uploaded</Badge>}
                  {viewingStaff.resume_file_id && <Badge variant="outline" className="text-xs">Resume uploaded</Badge>}
                  {viewingStaff.aadhar_doc_id && <Badge variant="outline" className="text-xs">Aadhar Doc</Badge>}
                  {viewingStaff.pan_doc_id && <Badge variant="outline" className="text-xs">PAN Doc</Badge>}
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Address & Emergency</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <InfoRow label="Current Address" value={viewingStaff.current_address || viewingStaff.address} />
                  <InfoRow label="Permanent Address" value={viewingStaff.permanent_address} />
                  <InfoRow label="Emergency Contact" value={viewingStaff.emergency_contact_name ? `${viewingStaff.emergency_contact_name} (${viewingStaff.emergency_contact_relation || '-'}) - ${viewingStaff.emergency_contact_phone || viewingStaff.emergency_contact || '-'}` : viewingStaff.emergency_contact} />
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Salary Details</h4>
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Basic" value={fmt(viewingStaff.basic_salary)} /><InfoRow label="HRA" value={fmt(viewingStaff.hra)} />
                  <InfoRow label="DA" value={fmt(viewingStaff.da)} /><InfoRow label="TA" value={fmt(viewingStaff.ta)} />
                  <InfoRow label="Other Allow." value={fmt(viewingStaff.other_allowances)} />
                  <InfoRow label="Gross" value={fmt(viewingStaff.gross_salary)} className="font-bold text-green-700" />
                  <InfoRow label="PF" value={fmt(viewingStaff.pf)} /><InfoRow label="ESI" value={fmt(viewingStaff.esi)} />
                  <InfoRow label="Prof. Tax" value={fmt(viewingStaff.professional_tax)} /><InfoRow label="TDS" value={fmt(viewingStaff.tds)} />
                  <InfoRow label="Other Ded." value={fmt(viewingStaff.other_deductions)} />
                  <InfoRow label="Net Salary" value={fmt(viewingStaff.net_salary)} className="font-bold text-emerald-700 text-base" />
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Bank Details</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Bank" value={viewingStaff.bank_name} /><InfoRow label="Account No" value={viewingStaff.account_number} />
                  <InfoRow label="IFSC" value={viewingStaff.ifsc_code} /><InfoRow label="Payment Method" value={viewingStaff.payment_method?.replace(/_/g, ' ')} />
                </div>
              </div>
              {viewingStaff.notes && (<div className="border-t pt-3"><h4 className="font-semibold text-sm text-gray-700 mb-1">Notes</h4><p className="text-sm text-gray-600">{viewingStaff.notes}</p></div>)}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog(false)}>Close</Button>
            <Button onClick={() => { setViewDialog(false); openEditEmployee(viewingStaff); }} className="bg-amber-600 hover:bg-amber-700"><Edit className="h-4 w-4 mr-1" /> Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== EDIT USER ROLE DIALOG ==================== */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle><DialogDescription>Update user details, role and status.</DialogDescription></DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={selectedUser.newName || ''} onChange={(e) => setSelectedUser({ ...selectedUser, newName: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={selectedUser.newEmail || ''} onChange={(e) => setSelectedUser({ ...selectedUser, newEmail: e.target.value })} data-testid="edit-user-email" /></div>
              <div><Label>Phone</Label><Input value={selectedUser.newPhone || ''} onChange={(e) => setSelectedUser({ ...selectedUser, newPhone: e.target.value })} /></div>
              <div><Label>Role</Label><Select value={selectedUser.newRole} onValueChange={(v) => setSelectedUser({ ...selectedUser, newRole: v })}><SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger><SelectContent>{ALL_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center gap-3"><Label>Active</Label><Button size="sm" variant={selectedUser.newActive ? 'default' : 'outline'} className={selectedUser.newActive ? 'bg-green-600' : ''} onClick={() => setSelectedUser({ ...selectedUser, newActive: !selectedUser.newActive })}>{selectedUser.newActive ? 'Active' : 'Inactive'}</Button></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setRoleDialog(false)}>Cancel</Button><Button onClick={handleUpdateUser} className="bg-amber-600 hover:bg-amber-700" data-testid="save-user-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== RESET PASSWORD DIALOG ==================== */}
      <Dialog open={resetPwdDialog} onOpenChange={setResetPwdDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>Reset password for {selectedUser?.name} ({selectedUser?.email})</DialogDescription></DialogHeader>
          <div><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" data-testid="input-new-password" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setResetPwdDialog(false)}>Cancel</Button><Button onClick={handleResetPassword} className="bg-red-600 hover:bg-red-700" data-testid="confirm-reset-pwd">Reset Password</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CREATE USER DIALOG ==================== */}
      <Dialog open={createUserDialog} onOpenChange={setCreateUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create User Account</DialogTitle><DialogDescription>Create login credentials for an employee</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Link to Employee (optional)</Label>
              <Select value={createUserForm.staff_id} onValueChange={(v) => {
                const emp = staff.find(s => s.staff_id === v);
                setCreateUserForm({ ...createUserForm, staff_id: v === 'none' ? '' : v, name: emp ? emp.name : createUserForm.name, email: emp?.email ? emp.email : createUserForm.email });
              }}>
                <SelectTrigger data-testid="select-employee-link"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No employee link --</SelectItem>
                  {staff.filter(s => s.status === 'active').map(s => (<SelectItem key={s.staff_id} value={s.staff_id}>{s.employee_code} - {s.name} ({s.designation || s.department})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Name</Label><Input value={createUserForm.name} onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })} placeholder="Full name" data-testid="create-user-name" /></div>
            <div><Label>Username (Email) *</Label><Input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })} placeholder="user@company.com" data-testid="create-user-email" /></div>
            <div><Label>Role *</Label><Select value={createUserForm.role} onValueChange={(v) => setCreateUserForm({ ...createUserForm, role: v })}><SelectTrigger data-testid="select-user-role"><SelectValue placeholder="Select role" /></SelectTrigger><SelectContent>{ALL_ROLES.filter(r => user?.role === 'super_admin' || !['super_admin', 'hr'].includes(r.value)).map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Password *</Label><div className="relative"><Input type={showPassword ? 'text' : 'password'} value={createUserForm.password} onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })} placeholder="Min 6 characters" className="pr-10" data-testid="create-user-password" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowPassword(!showPassword)} data-testid="toggle-password-visibility">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            <div><Label>Confirm Password *</Label><div className="relative"><Input type={showConfirmPassword ? 'text' : 'password'} value={createUserForm.confirm_password} onChange={(e) => setCreateUserForm({ ...createUserForm, confirm_password: e.target.value })} placeholder="Confirm password" className="pr-10" data-testid="create-user-confirm-password" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowConfirmPassword(!showConfirmPassword)} data-testid="toggle-confirm-password-visibility">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateUserDialog(false)}>Cancel</Button><Button onClick={handleCreateUser} className="bg-blue-600 hover:bg-blue-700" data-testid="submit-create-user">Create User</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MARK ATTENDANCE DIALOG ==================== */}
      <Dialog open={markDialog} onOpenChange={setMarkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Date</Label><Input value={markData.date} disabled className="bg-gray-50" /></div>
            <div><Label>Status</Label><Select value={markData.status} onValueChange={v => setMarkData(p => ({ ...p, status: v }))}><SelectTrigger data-testid="mark-status-select"><SelectValue /></SelectTrigger><SelectContent>{ATT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Remarks</Label><Input value={markData.remarks} onChange={e => setMarkData(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMarkDialog(false)}>Cancel</Button><Button onClick={handleMarkAttendance} className="bg-amber-600 hover:bg-amber-700" data-testid="confirm-mark-btn">Mark</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== PAYSLIP DIALOG ==================== */}
      <Dialog open={payslipDialog} onOpenChange={setPayslipDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {payslipData && <PayslipView data={payslipData} />}
        </DialogContent>
      </Dialog>

      {/* Leave History Dialog for Terminated Employees */}
      <Dialog open={!!viewLeaveHistory} onOpenChange={() => setViewLeaveHistory(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Leave History — {viewLeaveHistory?.name}
            </DialogTitle>
            <DialogDescription>
              {viewLeaveHistory?.employee_code} | {viewLeaveHistory?.department || '-'} | {viewLeaveHistory?.designation || '-'}
              {viewLeaveHistory?.terminated_at && <span className="text-red-600 ml-2">Terminated: {new Date(viewLeaveHistory.terminated_at).toLocaleDateString('en-IN')}</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-500">Total Attendance Days</p>
                <p className="text-xl font-bold text-blue-700">{viewLeaveHistory?.total_attendance_days || 0}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-500">Total Leave Requests</p>
                <p className="text-xl font-bold text-amber-700">{viewLeaveHistory?.leave_history?.length || 0}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-500">Approved Leaves</p>
                <p className="text-xl font-bold text-green-700">{viewLeaveHistory?.leave_history?.filter(l => l.status === 'approved').length || 0}</p>
              </div>
            </div>
            {viewLeaveHistory?.leave_history?.length > 0 ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">TYPE</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">FROM</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">TO</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">DAYS</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">STATUS</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">REASON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {viewLeaveHistory.leave_history.map((l, i) => (
                      <tr key={l.leave_id || i} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <Badge className={l.leave_type === 'PL' ? 'bg-blue-100 text-blue-700' : l.leave_type === 'SL' ? 'bg-red-100 text-red-700' : l.leave_type === 'CL' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}>{l.leave_type}</Badge>
                        </td>
                        <td className="px-3 py-2">{l.start_date ? new Date(l.start_date).toLocaleDateString('en-IN') : '-'}</td>
                        <td className="px-3 py-2">{l.end_date ? new Date(l.end_date).toLocaleDateString('en-IN') : '-'}</td>
                        <td className="px-3 py-2 text-center font-medium">{l.days || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={l.status === 'approved' ? 'bg-green-100 text-green-700' : l.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>{l.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">{l.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">No leave records found for this employee.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Employees from CSV</DialogTitle>
            <DialogDescription>Upload a CSV file with employee details to bulk import.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="download-template-btn">
                <FileText className="h-4 w-4 mr-1" /> Download Template
              </Button>
            </div>
            <div>
              <Label>Upload CSV File</Label>
              <Input type="file" accept=".csv" onChange={handleCSVUpload} data-testid="csv-file-input" className="mt-1" />
            </div>
            {importData.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-600 mb-2">{importData.length} employees ready to import</p>
                <div className="max-h-48 overflow-y-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Department</th>
                        <th className="px-2 py-1 text-left">Designation</th>
                        <th className="px-2 py-1 text-left">Phone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importData.map((emp, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{i+1}</td>
                          <td className="px-2 py-1">{emp.name}</td>
                          <td className="px-2 py-1">{emp.department}</td>
                          <td className="px-2 py-1">{emp.designation}</td>
                          <td className="px-2 py-1">{emp.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setImportDialog(false); setImportData([]); }}>Cancel</Button>
              <Button 
                onClick={handleBulkImport} 
                disabled={!importData.length || importing}
                className="bg-amber-600 hover:bg-amber-700"
                data-testid="confirm-import-btn"
              >
                {importing ? 'Importing...' : `Import ${importData.length} Employees`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}

// ==================== ATTENDANCE TAB ====================
function AttendanceTab({ monthlyAtt, attMonth, attYear, setAttMonth, setAttYear, onMarkClick, lateReport }) {
  const [viewMode, setViewMode] = useState('daily');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyData, setDailyData] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [uploading, setUploading] = useState(false);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  const fetchDaily = async (date) => {
    setDailyLoading(true);
    try {
      const res = await axios.get(`${API}/hr/attendance/daily?date=${date}`);
      setDailyData(res.data);
    } catch (e) { console.error(e); }
    finally { setDailyLoading(false); }
  };

  useEffect(() => { if (viewMode === 'daily') fetchDaily(dailyDate); }, [dailyDate, viewMode]);

  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/hr/attendance/csv-upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Synced ${res.data.synced} records. ${res.data.errors?.length || 0} errors.`);
      fetchDaily(dailyDate);
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const prevMonth = () => { if (attMonth === 1) { setAttMonth(12); setAttYear(attYear - 1); } else setAttMonth(attMonth - 1); };
  const nextMonth = () => { if (attMonth === 12) { setAttMonth(1); setAttYear(attYear + 1); } else setAttMonth(attMonth + 1); };
  const getStatusColor = (status) => {
    const map = { present: 'bg-green-100 text-green-700', wfh: 'bg-purple-100 text-purple-700', half_day: 'bg-yellow-100 text-yellow-800', absent: 'bg-gray-200 text-gray-600', paid_leave: 'bg-blue-100 text-blue-700', sick_leave: 'bg-red-100 text-red-700', casual_leave: 'bg-orange-100 text-orange-700', yet_to_login: 'bg-gray-100 text-gray-500' };
    return map[status] || 'bg-gray-50';
  };
  const getStatusLabel = (status) => {
    const map = { present: 'Present', wfh: 'Work from Home', half_day: 'Half Day', absent: 'Absent', paid_leave: 'Paid Leave', sick_leave: 'Sick Leave', casual_leave: 'Casual Leave', yet_to_login: 'Yet to Login' };
    return map[status] || status;
  };
  const getStatusShort = (status) => {
    const map = { present: 'P', wfh: 'W', half_day: 'H', absent: 'A', paid_leave: 'PL', sick_leave: 'SL', casual_leave: 'CL' };
    return map[status] || '-';
  };

  const filteredEmployees = dailyData?.employees?.filter(e => statusFilter === 'all' || e.status === statusFilter) || [];
  const sum = dailyData?.summary || {};

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <Card><CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          <Button variant={viewMode === 'daily' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('daily')} data-testid="att-view-daily">Day</Button>
          <Button variant={viewMode === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('calendar')} data-testid="att-view-calendar">Month</Button>
          <Button variant={viewMode === 'late' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('late')} data-testid="att-view-late">Late Report</Button>
        </div>
        {viewMode === 'daily' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(dailyDate); d.setDate(d.getDate() - 1); setDailyDate(d.toISOString().split('T')[0]); }}><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="h-8 w-[160px] text-sm" data-testid="att-daily-date" />
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(dailyDate); d.setDate(d.getDate() + 1); setDailyDate(d.toISOString().split('T')[0]); }}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setDailyDate(new Date().toISOString().split('T')[0])} className="text-xs">Today</Button>
            <Button variant="outline" size="sm" onClick={() => fetchDaily(dailyDate)} data-testid="att-refresh"><RefreshCcw className="h-3.5 w-3.5" /></Button>
            <label className="cursor-pointer">
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" data-testid="att-csv-input" />
              <span className={`inline-flex items-center gap-1 px-3 h-8 text-xs border rounded-md hover:bg-gray-50 ${uploading ? 'opacity-50' : ''}`}>
                <Upload className="h-3.5 w-3.5" />{uploading ? 'Uploading...' : 'CSV Upload'}
              </span>
            </label>
          </div>
        )}
        {viewMode === 'calendar' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-sm font-bold min-w-[120px] text-center" data-testid="att-month-year">{MONTHS[attMonth - 1]} {attYear}</h2>
            <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </CardContent></Card>

      {/* ===== DAILY VIEW ===== */}
      {viewMode === 'daily' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Employees', value: sum.total || 0, color: 'bg-slate-50 border-slate-200', text: 'text-slate-700', icon: Users },
              { label: 'Present', value: sum.present || 0, color: 'bg-green-50 border-green-200', text: 'text-green-700', icon: UserCheck },
              { label: 'Work from Home', value: sum.wfh || 0, color: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: Laptop },
              { label: 'Yet to Login', value: sum.yet_to_login || 0, color: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Clock },
              { label: 'Absent / Leave', value: (sum.absent || 0) + (sum.on_leave || 0), color: 'bg-red-50 border-red-200', text: 'text-red-700', icon: UserX },
              { label: 'Late Arrivals', value: sum.late || 0, color: 'bg-orange-50 border-orange-200', text: 'text-orange-700', icon: Timer },
            ].map(c => (
              <Card key={c.label} className={`${c.color} border`}>
                <CardContent className="p-3 flex flex-col items-center justify-center">
                  <c.icon className={`h-5 w-5 ${c.text} mb-1`} />
                  <p className={`text-2xl font-bold ${c.text}`}>{c.value}</p>
                  <p className="text-[10px] text-gray-500 text-center">{c.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'present', label: 'Present' },
              { id: 'wfh', label: 'WFH' },
              { id: 'yet_to_login', label: 'Yet to Login' },
              { id: 'absent', label: 'Absent' },
              { id: 'paid_leave', label: 'On Leave' },
            ].map(f => (
              <Button key={f.id} variant={statusFilter === f.id ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setStatusFilter(f.id)} data-testid={`att-filter-${f.id}`}>{f.label}</Button>
            ))}
          </div>

          {/* Employee Table */}
          {dailyLoading ? (
            <Card><CardContent className="p-8 text-center text-gray-400">Loading attendance...</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Designation</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Check In</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Check Out</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Worked Hrs</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEmployees.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No records for this date</td></tr>
                  ) : filteredEmployees.map(emp => (
                    <tr key={emp.staff_id} className="hover:bg-gray-50/50" data-testid={`att-daily-row-${emp.staff_id}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{emp.name}</p>
                        <p className="text-xs text-gray-400">{emp.employee_code}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{emp.designation || '-'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(emp.status)}`}>
                          {emp.is_late && <Timer className="h-3 w-3 text-orange-500" />}
                          {getStatusLabel(emp.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-mono">{emp.check_in || '-'}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-mono">{emp.check_out || '-'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {emp.work_hours > 0 ? (
                          <span className={`text-xs font-bold ${emp.work_hours >= 8 ? 'text-green-600' : emp.work_hours >= 4 ? 'text-amber-600' : 'text-red-600'}`}>{emp.work_hours}h</span>
                        ) : <span className="text-xs text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${emp.source === 'essl' ? 'bg-blue-50 text-blue-600' : emp.source === 'gps' ? 'bg-teal-50 text-teal-600' : 'bg-gray-50 text-gray-400'}`}>
                          {emp.source === 'essl' ? 'Biometric' : emp.source === 'gps' ? 'GPS' : emp.source || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </>
      )}

      {/* ===== MONTHLY CALENDAR VIEW ===== */}
      {viewMode === 'calendar' && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {[['P','Present','bg-green-100 text-green-700'],['PL','Paid Leave','bg-blue-100 text-blue-700'],['SL','Sick Leave','bg-red-100 text-red-700'],['CL','Casual Leave','bg-orange-100 text-orange-700'],['W','WFH','bg-purple-100 text-purple-700'],['H','Half Day','bg-yellow-100 text-yellow-800'],['A','Absent','bg-gray-200 text-gray-600']].map(([c,l,cls]) => (
              <span key={c} className={`px-2 py-0.5 rounded ${cls}`}>{c} = {l}</span>
            ))}
          </div>
          {monthlyAtt && (
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[140px] sticky left-0 bg-gray-50 z-10">Employee</th>
                    {Array.from({ length: monthlyAtt.days_in_month }, (_, i) => (<th key={i + 1} className="px-1 py-2 text-center font-medium text-gray-500 min-w-[32px]">{i + 1}</th>))}
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[40px]">P</th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[40px]">A</th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[40px]">L</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthlyAtt.staff?.map(s => (
                    <tr key={s.staff_id} className="hover:bg-gray-50/50" data-testid={`att-row-${s.staff_id}`}>
                      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 border-r"><p className="font-medium text-gray-900 truncate">{s.name}</p><p className="text-gray-400">{s.employee_code}</p></td>
                      {Array.from({ length: monthlyAtt.days_in_month }, (_, i) => {
                        const day = s.days[String(i + 1)];
                        const dateStr = `${attYear}-${String(attMonth).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                        return (<td key={i + 1} className="px-0.5 py-1 text-center cursor-pointer" onClick={() => onMarkClick(s.staff_id, dateStr)} title={`Mark ${s.name} for ${dateStr}`}>
                          {day ? (<span className={`inline-block w-6 h-6 leading-6 rounded text-[10px] font-bold ${getStatusColor(day.status)}`} data-testid={`cell-${s.staff_id}-${i+1}`}>{getStatusShort(day.status)}</span>) : <span className="inline-block w-6 h-6 leading-6 rounded bg-gray-50 text-gray-300">-</span>}
                        </td>);
                      })}
                      <td className="px-2 py-1 text-center font-bold text-green-600">{s.summary.present}</td>
                      <td className="px-2 py-1 text-center font-bold text-red-600">{s.summary.absent}</td>
                      <td className="px-2 py-1 text-center font-bold text-blue-600">{s.summary.leaves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent></Card>
          )}
        </>
      )}

      {/* ===== LATE REPORT VIEW ===== */}
      {viewMode === 'late' && (
        <>
          <Card><CardContent className="p-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-sm font-bold">{MONTHS[attMonth - 1]} {attYear}</h2>
            <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Timer className="h-5 w-5 text-orange-500" />Late Arrivals - {MONTHS[attMonth - 1]} {attYear}</CardTitle></CardHeader>
            <CardContent>{lateReport?.employees?.length === 0 ? <p className="text-gray-500 text-center py-4">No late arrivals this month!</p> : (
              <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr>
                <th className="px-4 py-2 text-left text-xs font-semibold">Employee</th>
                <th className="px-4 py-2 text-center text-xs font-semibold">Late Days</th>
                <th className="px-4 py-2 text-center text-xs font-semibold">Total Late (mins)</th>
                <th className="px-4 py-2 text-center text-xs font-semibold">Avg Late (mins)</th>
              </tr></thead><tbody className="divide-y">{lateReport?.employees?.map(e => (
                <tr key={e.staff_id}><td className="px-4 py-2 font-medium">{e.name}</td><td className="px-4 py-2 text-center"><Badge className="bg-orange-100 text-orange-700">{e.late_days}</Badge></td><td className="px-4 py-2 text-center font-bold text-red-600">{e.total_late_minutes}</td><td className="px-4 py-2 text-center">{e.late_days > 0 ? Math.round(e.total_late_minutes / e.late_days) : 0}</td></tr>
              ))}</tbody></table>
            )}</CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ==================== LEAVE TAB ====================
function LeaveTab({ requests, filter, setFilter, onAction }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{['pending', 'approved', 'rejected', ''].map(f => (
        <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} data-testid={`leave-filter-${f || 'all'}`}>{f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}</Button>
      ))}</div>
      <Card><CardContent className="p-0"><table className="w-full text-sm">
        <thead className="bg-gray-50 border-b"><tr>
          <th className="px-4 py-3 text-left text-xs font-semibold">Employee</th><th className="px-4 py-3 text-left text-xs font-semibold">Type</th>
          <th className="px-4 py-3 text-left text-xs font-semibold">Dates</th><th className="px-4 py-3 text-center text-xs font-semibold">Days</th>
          <th className="px-4 py-3 text-left text-xs font-semibold">Reason</th><th className="px-4 py-3 text-center text-xs font-semibold">Status</th>
          <th className="px-4 py-3 text-center text-xs font-semibold">Actions</th>
        </tr></thead>
        <tbody className="divide-y">{requests.length === 0 ? (
          <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">No leave requests found.</td></tr>
        ) : requests.map(r => {
          const typeInfo = LEAVE_TYPES.find(t => t.value === r.leave_type);
          return (<tr key={r.leave_id} data-testid={`leave-row-${r.leave_id}`}>
            <td className="px-4 py-3"><p className="font-medium">{r.staff_name}</p><p className="text-xs text-gray-500">{r.department}</p></td>
            <td className="px-4 py-3"><Badge className={typeInfo?.color || 'bg-gray-100'}>{typeInfo?.label || r.leave_type}</Badge></td>
            <td className="px-4 py-3 text-gray-600">{r.start_date && new Date(r.start_date).toLocaleDateString('en-IN')}{r.start_date !== r.end_date && ` - ${new Date(r.end_date).toLocaleDateString('en-IN')}`}{r.is_half_day && <span className="text-xs text-yellow-600 ml-1">(Half)</span>}</td>
            <td className="px-4 py-3 text-center font-bold">{r.days}</td>
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.reason || '-'}</td>
            <td className="px-4 py-3 text-center"><Badge className={r.status === 'approved' ? 'bg-green-100 text-green-700' : r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>{r.status}</Badge></td>
            <td className="px-4 py-3 text-center">{r.status === 'pending' && (<div className="flex justify-center gap-1">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2" onClick={() => onAction(r.leave_id, 'approve')} data-testid={`approve-leave-${r.leave_id}`}><CheckCircle2 className="h-3 w-3 mr-1" />Approve</Button>
              <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => onAction(r.leave_id, 'reject')} data-testid={`reject-leave-${r.leave_id}`}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
            </div>)}</td>
          </tr>);
        })}</tbody>
      </table></CardContent></Card>
    </div>
  );
}

// ==================== PAYROLL TAB ====================
function PayrollTab({ data, month, year, setMonth, setYear, onCalculate, onViewPayslip }) {
  const totalGross = data.reduce((s, p) => s + (p.gross_earnings || 0), 0);
  const totalNet = data.reduce((s, p) => s + (p.net_pay || 0), 0);
  const totalDed = data.reduce((s, p) => s + (p.total_deductions || 0), 0);
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}><SelectTrigger className="w-36" data-testid="pay-month-select"><SelectValue /></SelectTrigger><SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}><SelectTrigger className="w-24" data-testid="pay-year-select"><SelectValue /></SelectTrigger><SelectContent>{[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
        </div>
        <Button onClick={onCalculate} className="bg-amber-600 hover:bg-amber-700" data-testid="calculate-salary-btn"><Calculator className="h-4 w-4 mr-1" />Calculate Salary</Button>
      </CardContent></Card>
      {data.length > 0 && (<>
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">Total Gross</p><p className="text-xl font-bold text-blue-600">{fmt(totalGross)}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">Total Deductions</p><p className="text-xl font-bold text-red-600">{fmt(totalDed)}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">Total Net Pay</p><p className="text-xl font-bold text-green-600">{fmt(totalNet)}</p></CardContent></Card>
        </div>
        <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="px-3 py-2 text-left text-xs font-semibold">Employee</th><th className="px-3 py-2 text-center text-xs font-semibold">Working</th>
            <th className="px-3 py-2 text-center text-xs font-semibold">Present</th><th className="px-3 py-2 text-center text-xs font-semibold">LOP</th>
            <th className="px-3 py-2 text-center text-xs font-semibold">Late</th><th className="px-3 py-2 text-right text-xs font-semibold">Gross</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Deductions</th><th className="px-3 py-2 text-right text-xs font-semibold">Net Pay</th>
            <th className="px-3 py-2 text-center text-xs font-semibold">Payslip</th>
          </tr></thead>
          <tbody className="divide-y">{data.map(p => (
            <tr key={p.staff_id} data-testid={`payroll-row-${p.staff_id}`}>
              <td className="px-3 py-2"><p className="font-medium">{p.staff_name}</p><p className="text-xs text-gray-500">{p.employee_code} | {p.department}</p></td>
              <td className="px-3 py-2 text-center">{p.working_days}</td><td className="px-3 py-2 text-center text-green-600 font-medium">{p.net_days_present}</td>
              <td className="px-3 py-2 text-center text-red-600 font-medium">{p.lop_days}</td><td className="px-3 py-2 text-center text-orange-600">{p.late_days} ({p.total_late_minutes}m)</td>
              <td className="px-3 py-2 text-right font-medium">{fmt(p.gross_earnings)}</td><td className="px-3 py-2 text-right text-red-600">{fmt(p.total_deductions)}</td>
              <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(p.net_pay)}</td>
              <td className="px-3 py-2 text-center"><Button size="sm" variant="ghost" onClick={() => onViewPayslip(p.staff_id)} data-testid={`view-payslip-${p.staff_id}`}><FileText className="h-4 w-4" /></Button></td>
            </tr>
          ))}</tbody>
        </table></div></CardContent></Card>
      </>)}
    </div>
  );
}

// ==================== PAYSLIP VIEW ====================
function PayslipView({ data }) {
  const { payroll: p, staff: s, company } = data;
  const monthName = MONTHS[(p?.month || 1) - 1];
  return (
    <div className="space-y-4" data-testid="payslip-view">
      <div className="text-center border-b pb-4">
        <h2 className="text-xl font-bold text-gray-900">{company?.name || 'Company'}</h2>
        <p className="text-sm text-gray-500">{company?.address}</p>
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg py-2"><p className="font-semibold text-amber-800">Payslip for {monthName} {p?.year}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-b pb-4">
        <div className="flex justify-between"><span className="text-gray-500">Name:</span><span className="font-medium">{p?.staff_name}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Employee Code:</span><span className="font-medium">{p?.employee_code}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Department:</span><span className="font-medium">{p?.department}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Designation:</span><span className="font-medium">{p?.designation}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Bank:</span><span className="font-medium">{p?.bank_name}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Account:</span><span className="font-medium">{p?.account_number}</span></div>
      </div>
      <div className="border-b pb-4">
        <h4 className="font-semibold text-gray-700 mb-2">Attendance Summary</h4>
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div className="bg-gray-50 p-2 rounded text-center"><p className="text-xs text-gray-500">Working Days</p><p className="font-bold">{p?.working_days}</p></div>
          <div className="bg-green-50 p-2 rounded text-center"><p className="text-xs text-gray-500">Net Present</p><p className="font-bold text-green-600">{p?.net_days_present}</p></div>
          <div className="bg-red-50 p-2 rounded text-center"><p className="text-xs text-gray-500">LOP Days</p><p className="font-bold text-red-600">{p?.lop_days}</p></div>
          <div className="bg-orange-50 p-2 rounded text-center"><p className="text-xs text-gray-500">Late Days</p><p className="font-bold text-orange-600">{p?.late_days}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div><h4 className="font-semibold text-gray-700 mb-2 text-green-700">Earnings</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Basic Earned</span><span className="font-medium">{fmt(p?.basic_salary)}</span></div>
            <div className="flex justify-between"><span>H.R.A.</span><span className="font-medium">{fmt(p?.hra)}</span></div>
            <div className="flex justify-between"><span>P.A.</span><span className="font-medium">{fmt(p?.pa)}</span></div>
            <div className="flex justify-between"><span>F.A.</span><span className="font-medium">{fmt(p?.fa)}</span></div>
            <div className="flex justify-between border-t pt-1 font-bold"><span>Gross Earnings</span><span className="text-green-700">{fmt(p?.gross_earnings)}</span></div>
          </div>
        </div>
        <div><h4 className="font-semibold text-gray-700 mb-2 text-red-700">Deductions</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>LOP</span><span className="font-medium">{fmt(p?.lop_deduction)}</span></div>
            <div className="flex justify-between"><span>Loan</span><span className="font-medium">{fmt(p?.loan_deduction)}</span></div>
            <div className="flex justify-between"><span>Late Deduction</span><span className="font-medium">{fmt(p?.late_deduction)}</span></div>
            <div className="flex justify-between border-t pt-1 font-bold"><span>Total Deduction</span><span className="text-red-700">{fmt(p?.total_deductions)}</span></div>
          </div>
        </div>
      </div>
      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">Net Pay</p>
        <p className="text-3xl font-bold text-amber-800">{fmt(p?.net_pay)}</p>
        <p className="text-xs text-gray-500 mt-1">Per Day: {fmt(p?.per_day_salary)}</p>
      </div>
    </div>
  );
}

// ==================== SETTINGS TAB ====================
function SettingsTab({ settings, setSettings, onSave, user }) {
  const [syncKeyLoading, setSyncKeyLoading] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [keyCopied, setKeyCopied] = useState(false);

  if (!settings) return <div className="text-center py-8 text-gray-500">Loading settings...</div>;
  const updateTiming = (dept, field, value) => {
    setSettings(prev => ({ ...prev, department_timings: { ...prev.department_timings, [dept]: { ...prev.department_timings[dept], [field]: field === 'grace_minutes' ? Number(value) : value } } }));
  };
  const updateLeave = (type, field, value) => {
    setSettings(prev => ({ ...prev, leave_limits: { ...prev.leave_limits, [type]: { ...prev.leave_limits[type], [field]: field === 'annual_limit' ? Number(value) : value } } }));
  };

  const handleGenerateSyncKey = async () => {
    setSyncKeyLoading(true);
    try {
      const res = await axios.post(`${API}/hr/attendance/generate-sync-key`);
      setGeneratedKey(res.data.sync_key);
      setKeyCopied(false);
      toast.success('Sync key generated! Copy it now — it won\'t be shown again.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to generate sync key');
    } finally { setSyncKeyLoading(false); }
  };

  const handleRevokeSyncKey = async () => {
    if (!window.confirm('Revoke the current sync key? The eSSL sync script will stop working until a new key is generated.')) return;
    setSyncKeyLoading(true);
    try {
      await axios.delete(`${API}/hr/attendance/revoke-sync-key`);
      setGeneratedKey(null);
      toast.success('Sync key revoked.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to revoke sync key');
    } finally { setSyncKeyLoading(false); }
  };

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
      toast.success('Key copied to clipboard!');
    }
  };

  return (
    <div className="space-y-6">
      <Card><CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Company Name</Label><Input value={settings.company_name || ''} onChange={e => setSettings(p => ({ ...p, company_name: e.target.value }))} data-testid="company-name-input" /></div>
          <div><Label>Company Address</Label><Input value={settings.company_address || ''} onChange={e => setSettings(p => ({ ...p, company_address: e.target.value }))} data-testid="company-address-input" /></div>
        </CardContent>
      </Card>

      {user?.role === 'super_admin' && (
        <Card className="border-blue-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="h-5 w-5 text-blue-600" />Biometric Sync Key (eSSL)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">Generate a secure API key for the eSSL eTimeTrackLite auto-sync script. This key allows the office PC to push biometric attendance data to the CRM without needing a user password.</p>
            {generatedKey ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-xs text-green-700 font-semibold mb-2">New Sync Key Generated — Copy it now! It will NOT be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border rounded px-3 py-2 text-sm font-mono break-all select-all" data-testid="sync-key-value">{generatedKey}</code>
                    <Button size="sm" variant={keyCopied ? 'default' : 'outline'} onClick={copyKey} data-testid="copy-sync-key-btn" className={keyCopied ? 'bg-green-600 hover:bg-green-700 text-white' : ''}>
                      {keyCopied ? <><Check className="h-4 w-4 mr-1" />Copied</> : <>Copy</>}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Paste this key in the <code className="bg-gray-100 px-1 rounded">essl_sync.py</code> script's <code className="bg-gray-100 px-1 rounded">SYNC_KEY</code> field.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button onClick={handleGenerateSyncKey} disabled={syncKeyLoading} className="bg-blue-600 hover:bg-blue-700" data-testid="generate-sync-key-btn">
                  {syncKeyLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
                  Generate Sync Key
                </Button>
                <Button variant="destructive" size="sm" onClick={handleRevokeSyncKey} disabled={syncKeyLoading} data-testid="revoke-sync-key-btn">
                  <Trash2 className="h-4 w-4 mr-1" />Revoke Existing Key
                </Button>
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
              <p className="text-xs font-semibold text-amber-800 mb-1">Setup Instructions:</p>
              <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
                <li>Install Python on your office PC: <code className="bg-white px-1 rounded">pip install pyodbc requests</code></li>
                <li>Download the <code className="bg-white px-1 rounded">essl_sync.py</code> script</li>
                <li>Click "Generate Sync Key" above and copy the key</li>
                <li>Paste the key in the script's CONFIG section</li>
                <li>Set your eTimeTrackLite DB_SERVER and DB_NAME</li>
                <li>Test: <code className="bg-white px-1 rounded">python essl_sync.py --test</code></li>
                <li>Schedule daily run via Windows Task Scheduler</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Department Timings</CardTitle></CardHeader>
        <CardContent><div className="space-y-3">{Object.entries(settings.department_timings || {}).map(([dept, timing]) => (
          <div key={dept} className="grid grid-cols-4 gap-3 items-center">
            <Label className="font-medium">{dept}</Label>
            <div><Label className="text-xs text-gray-500">Start</Label><Input type="time" value={timing.start || ''} onChange={e => updateTiming(dept, 'start', e.target.value)} /></div>
            <div><Label className="text-xs text-gray-500">End</Label><Input type="time" value={timing.end || ''} onChange={e => updateTiming(dept, 'end', e.target.value)} /></div>
            <div><Label className="text-xs text-gray-500">Grace (min)</Label><Input type="number" value={timing.grace_minutes || 0} onChange={e => updateTiming(dept, 'grace_minutes', e.target.value)} /></div>
          </div>
        ))}</div></CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" />Annual Leave Limits</CardTitle></CardHeader>
        <CardContent><div className="space-y-3">{Object.entries(settings.leave_limits || {}).map(([type, info]) => (
          <div key={type} className="grid grid-cols-3 gap-3 items-center">
            <div><Label className="font-medium">{info.name || type}</Label><p className="text-xs text-gray-500">Code: {type}</p></div>
            <div><Label className="text-xs text-gray-500">Annual Limit</Label><Input type="number" value={info.annual_limit || 0} onChange={e => updateLeave(type, 'annual_limit', e.target.value)} data-testid={`leave-limit-${type}`} /></div>
            <div className="flex items-center gap-2 pt-4"><input type="checkbox" checked={info.carry_forward || false} onChange={e => updateLeave(type, 'carry_forward', e.target.checked)} /><Label className="text-xs">Carry Forward</Label></div>
          </div>
        ))}</div></CardContent>
      </Card>
      <Button onClick={onSave} className="bg-amber-600 hover:bg-amber-700" data-testid="save-settings-btn">Save Settings</Button>
    </div>
  );
}

function InfoRow({ label, value, className = '' }) {
  if (!value && value !== 0) return null;
  return (<div className="flex flex-col"><span className="text-xs text-gray-500">{label}</span><span className={`text-gray-900 ${className}`}>{value}</span></div>);
}
