import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Users, UserPlus, Calendar, Edit, Trash2, Eye,
  Phone, Mail, Search, Clock, MapPin, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Download, Calculator, FileText,
  Settings, AlertCircle, Timer, TrendingUp
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEPARTMENTS = ['Accounts', 'Engineering', 'HR', 'Admin', 'Sales', 'Operations', 'Planning', 'Procurement', 'CRM', 'Design'];
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

export default function HRPortal() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Attendance state
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1);
  const [attYear, setAttYear] = useState(new Date().getFullYear());
  const [monthlyAtt, setMonthlyAtt] = useState(null);
  const [markDialog, setMarkDialog] = useState(false);
  const [markData, setMarkData] = useState({ staff_id: '', date: '', status: 'P', remarks: '' });

  // Leave state
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveFilter, setLeaveFilter] = useState('pending');

  // Payroll state
  const [payMonth, setPayMonth] = useState(new Date().getMonth() + 1);
  const [payYear, setPayYear] = useState(new Date().getFullYear());
  const [payrollData, setPayrollData] = useState([]);
  const [payslipDialog, setPayslipDialog] = useState(false);
  const [payslipData, setPayslipData] = useState(null);

  // Dashboard state
  const [dashboardData, setDashboardData] = useState(null);

  // Settings state
  const [hrSettings, setHrSettings] = useState(null);
  const [settingsDialog, setSettingsDialog] = useState(false);

  // Late report
  const [lateReport, setLateReport] = useState(null);

  useEffect(() => { fetchInitial(); }, []);

  const fetchInitial = async () => {
    try {
      setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['super_admin', 'hr'].includes(userRes.data.role)) {
        toast.error('Access denied');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);
      const [staffRes, dashRes, settRes] = await Promise.allSettled([
        axios.get(`${API}/hr/staff`),
        axios.get(`${API}/hr/dashboard`),
        axios.get(`${API}/hr/settings`),
      ]);
      if (staffRes.status === 'fulfilled') setStaff(staffRes.value.data || []);
      if (dashRes.status === 'fulfilled') setDashboardData(dashRes.value.data);
      if (settRes.status === 'fulfilled') setHrSettings(settRes.value.data);
    } catch (e) {
      if (e.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };

  const fetchMonthlyAttendance = async () => {
    try {
      const res = await axios.get(`${API}/hr/attendance/monthly?month=${attMonth}&year=${attYear}`);
      setMonthlyAtt(res.data);
    } catch (e) { toast.error('Failed to load attendance'); }
  };

  const fetchLateReport = async () => {
    try {
      const res = await axios.get(`${API}/hr/attendance/late-report?month=${attMonth}&year=${attYear}`);
      setLateReport(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchLeaveRequests = async () => {
    try {
      const url = leaveFilter ? `${API}/hr/leave/requests?status=${leaveFilter}` : `${API}/hr/leave/requests`;
      const res = await axios.get(url);
      setLeaveRequests(res.data || []);
    } catch (e) { toast.error('Failed to load leave requests'); }
  };

  const fetchPayroll = async () => {
    try {
      const res = await axios.get(`${API}/hr/salary/list?month=${payMonth}&year=${payYear}`);
      setPayrollData(res.data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (activeTab === 'attendance') { fetchMonthlyAttendance(); fetchLateReport(); } }, [activeTab, attMonth, attYear]);
  useEffect(() => { if (activeTab === 'leave') fetchLeaveRequests(); }, [activeTab, leaveFilter]);
  useEffect(() => { if (activeTab === 'payroll') fetchPayroll(); }, [activeTab, payMonth, payYear]);

  const handleMarkAttendance = async () => {
    try {
      await axios.post(`${API}/hr/attendance/mark`, markData);
      toast.success('Attendance marked');
      setMarkDialog(false);
      fetchMonthlyAttendance();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleLeaveAction = async (leaveId, action) => {
    try {
      await axios.patch(`${API}/hr/leave/${leaveId}/action`, { action });
      toast.success(`Leave ${action}d`);
      fetchLeaveRequests();
    } catch (e) { toast.error('Failed'); }
  };

  const handleCalculateSalary = async () => {
    try {
      toast.info('Calculating salaries...');
      const res = await axios.post(`${API}/hr/salary/calculate`, { month: payMonth, year: payYear });
      setPayrollData(res.data.payroll || []);
      toast.success(`Salary calculated for ${res.data.payroll?.length || 0} employees`);
    } catch (e) { toast.error('Calculation failed'); }
  };

  const openPayslip = async (staffId) => {
    try {
      const res = await axios.get(`${API}/hr/payslip/${staffId}?month=${payMonth}&year=${payYear}`);
      setPayslipData(res.data);
      setPayslipDialog(true);
    } catch (e) { toast.error('Payslip not found'); }
  };

  const handleSaveSettings = async () => {
    try {
      await axios.patch(`${API}/hr/settings`, hrSettings);
      toast.success('Settings saved');
      setSettingsDialog(false);
    } catch (e) { toast.error('Failed to save'); }
  };

  const filteredStaff = staff.filter(s => {
    const matchSearch = !searchTerm || s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchDept = !departmentFilter || s.department === departmentFilter;
    return matchSearch && matchDept;
  });

  const getStatusDot = (status) => {
    const map = { present: 'bg-green-500', wfh: 'bg-purple-500', half_day: 'bg-yellow-500', absent: 'bg-gray-400', paid_leave: 'bg-blue-500', sick_leave: 'bg-red-500', casual_leave: 'bg-orange-500' };
    return map[status] || 'bg-gray-300';
  };

  const getStatusLabel = (status) => {
    const map = { present: 'P', wfh: 'WFH', half_day: 'HD', absent: 'A', paid_leave: 'PL', sick_leave: 'SL', casual_leave: 'CL' };
    return map[status] || '-';
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="hr-portal">
      <AppHeader user={user} />
      <div className="max-w-[1400px] mx-auto px-4 py-6">
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
            <TabsTrigger value="attendance" data-testid="tab-attendance"><Calendar className="h-4 w-4 mr-1" />Attendance</TabsTrigger>
            <TabsTrigger value="leave" data-testid="tab-leave"><FileText className="h-4 w-4 mr-1" />Leave</TabsTrigger>
            <TabsTrigger value="payroll" data-testid="tab-payroll"><Calculator className="h-4 w-4 mr-1" />Payroll</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings"><Settings className="h-4 w-4 mr-1" />Settings</TabsTrigger>
          </TabsList>

          {/* ===== DASHBOARD ===== */}
          <TabsContent value="dashboard">
            <DashboardTab data={dashboardData} staff={staff} />
          </TabsContent>

          {/* ===== EMPLOYEES ===== */}
          <TabsContent value="employees">
            <EmployeesTab staff={filteredStaff} allStaff={staff} searchTerm={searchTerm} setSearchTerm={setSearchTerm} departmentFilter={departmentFilter} setDepartmentFilter={setDepartmentFilter} onRefresh={fetchInitial} />
          </TabsContent>

          {/* ===== ATTENDANCE ===== */}
          <TabsContent value="attendance">
            <AttendanceTab monthlyAtt={monthlyAtt} attMonth={attMonth} attYear={attYear} setAttMonth={setAttMonth} setAttYear={setAttYear} onMarkClick={(staffId, date) => { setMarkData({ staff_id: staffId, date, status: 'P', remarks: '' }); setMarkDialog(true); }} lateReport={lateReport} />
          </TabsContent>

          {/* ===== LEAVE ===== */}
          <TabsContent value="leave">
            <LeaveTab requests={leaveRequests} filter={leaveFilter} setFilter={setLeaveFilter} onAction={handleLeaveAction} />
          </TabsContent>

          {/* ===== PAYROLL ===== */}
          <TabsContent value="payroll">
            <PayrollTab data={payrollData} month={payMonth} year={payYear} setMonth={setPayMonth} setYear={setPayYear} onCalculate={handleCalculateSalary} onViewPayslip={openPayslip} />
          </TabsContent>

          {/* ===== SETTINGS ===== */}
          <TabsContent value="settings">
            <SettingsTab settings={hrSettings} setSettings={setHrSettings} onSave={handleSaveSettings} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mark Attendance Dialog */}
      <Dialog open={markDialog} onOpenChange={setMarkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Date</Label><Input value={markData.date} disabled className="bg-gray-50" /></div>
            <div>
              <Label>Status</Label>
              <Select value={markData.status} onValueChange={v => setMarkData(p => ({ ...p, status: v }))}>
                <SelectTrigger data-testid="mark-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ATT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Remarks</Label><Input value={markData.remarks} onChange={e => setMarkData(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkDialog(false)}>Cancel</Button>
            <Button onClick={handleMarkAttendance} className="bg-amber-600 hover:bg-amber-700" data-testid="confirm-mark-btn">Mark</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslip Dialog */}
      <Dialog open={payslipDialog} onOpenChange={setPayslipDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {payslipData && <PayslipView data={payslipData} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== DASHBOARD TAB ====================
function DashboardTab({ data, staff }) {
  if (!data) return <div className="text-center py-8 text-gray-500">Loading dashboard...</div>;
  const cards = [
    { label: 'Total Employees', value: data.total_staff, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Present Today', value: data.today_present, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
    { label: 'Absent Today', value: data.today_absent, icon: XCircle, color: 'text-red-600 bg-red-50' },
    { label: 'Late Today', value: data.today_late, icon: Timer, color: 'text-orange-600 bg-orange-50' },
    { label: 'Pending Leaves', value: data.pending_leaves, icon: AlertCircle, color: 'text-purple-600 bg-purple-50' },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c, i) => (
          <Card key={i} data-testid={`dash-card-${i}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${c.color}`}><c.icon className="h-5 w-5" /></div>
              <div><p className="text-xs text-gray-500">{c.label}</p><p className="text-xl font-bold">{c.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      {data.department_counts && Object.keys(data.department_counts).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Department Strength</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(data.department_counts).map(([dept, count]) => (
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
  );
}

// ==================== EMPLOYEES TAB ====================
function EmployeesTab({ staff, allStaff, searchTerm, setSearchTerm, departmentFilter, setDepartmentFilter, onRefresh }) {
  const [viewDialog, setViewDialog] = useState(false);
  const [viewingStaff, setViewingStaff] = useState(null);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-lg">Employee Directory ({staff.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 w-48" data-testid="search-employee" />
            </div>
            <Select value={departmentFilter || 'all'} onValueChange={v => setDepartmentFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40" data-testid="filter-department"><SelectValue placeholder="All Depts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">JOINED</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">NET SALARY</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No employees found.</td></tr>
              ) : staff.map(s => (
                <tr key={s.staff_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setViewingStaff(s); setViewDialog(true); }} data-testid={`emp-row-${s.staff_id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">{s.name?.charAt(0)?.toUpperCase()}</div>
                      <div>
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.employee_code} {s.designation ? `| ${s.designation}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.department || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {s.email && <p className="text-gray-600 flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</p>}
                    {s.phone && <p className="text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.date_of_joining ? new Date(s.date_of_joining).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(s.net_salary)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{s.status || 'Active'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* View Employee Dialog */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Employee Details</DialogTitle></DialogHeader>
          {viewingStaff && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl">{viewingStaff.name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <h3 className="text-lg font-bold">{viewingStaff.name}</h3>
                  <p className="text-sm text-gray-500">{viewingStaff.employee_code} | {viewingStaff.designation} | {viewingStaff.department}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Email', viewingStaff.email],
                  ['Phone', viewingStaff.phone],
                  ['Gender', viewingStaff.gender],
                  ['DOB', viewingStaff.date_of_birth ? new Date(viewingStaff.date_of_birth).toLocaleDateString('en-IN') : null],
                  ['Joining Date', viewingStaff.date_of_joining ? new Date(viewingStaff.date_of_joining).toLocaleDateString('en-IN') : null],
                  ['Blood Group', viewingStaff.blood_group],
                  ['PAN', viewingStaff.pan_number],
                  ['Aadhar', viewingStaff.aadhar_number],
                  ['Bank', viewingStaff.bank_name],
                  ['Account', viewingStaff.account_number],
                  ['IFSC', viewingStaff.ifsc_code],
                  ['Work Location', viewingStaff.work_location],
                  ['Reporting Manager', viewingStaff.reporting_manager],
                  ['Address', viewingStaff.address],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}><p className="text-gray-500 text-xs">{label}</p><p className="font-medium">{value}</p></div>
                ))}
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold mb-2">Salary Breakdown</h4>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-gray-500 text-xs">Basic</p><p className="font-medium">{fmt(viewingStaff.basic_salary)}</p></div>
                  <div><p className="text-gray-500 text-xs">HRA</p><p className="font-medium">{fmt(viewingStaff.hra)}</p></div>
                  <div><p className="text-gray-500 text-xs">PA</p><p className="font-medium">{fmt(viewingStaff.pa || viewingStaff.other_allowances)}</p></div>
                  <div><p className="text-gray-500 text-xs">Gross</p><p className="font-bold text-blue-600">{fmt(viewingStaff.gross_salary)}</p></div>
                  <div><p className="text-gray-500 text-xs">Deductions</p><p className="font-medium text-red-600">{fmt(viewingStaff.total_deductions)}</p></div>
                  <div><p className="text-gray-500 text-xs">Net Pay</p><p className="font-bold text-green-600">{fmt(viewingStaff.net_salary)}</p></div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ==================== ATTENDANCE TAB ====================
function AttendanceTab({ monthlyAtt, attMonth, attYear, setAttMonth, setAttYear, onMarkClick, lateReport }) {
  const [viewMode, setViewMode] = useState('calendar');
  const prevMonth = () => { if (attMonth === 1) { setAttMonth(12); setAttYear(attYear - 1); } else setAttMonth(attMonth - 1); };
  const nextMonth = () => { if (attMonth === 12) { setAttMonth(1); setAttYear(attYear + 1); } else setAttMonth(attMonth + 1); };

  const getStatusColor = (status) => {
    const map = { present: 'bg-green-100 text-green-700', wfh: 'bg-purple-100 text-purple-700', half_day: 'bg-yellow-100 text-yellow-800', absent: 'bg-gray-200 text-gray-600', paid_leave: 'bg-blue-100 text-blue-700', sick_leave: 'bg-red-100 text-red-700', casual_leave: 'bg-orange-100 text-orange-700' };
    return map[status] || 'bg-gray-50';
  };
  const getStatusShort = (status) => {
    const map = { present: 'P', wfh: 'W', half_day: 'H', absent: 'A', paid_leave: 'PL', sick_leave: 'SL', casual_leave: 'CL' };
    return map[status] || '-';
  };

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={prevMonth} data-testid="prev-month"><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-bold" data-testid="att-month-year">{MONTHS[attMonth - 1]} {attYear}</h2>
          <div className="flex gap-2">
            <Button variant={viewMode === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('calendar')}>Calendar</Button>
            <Button variant={viewMode === 'late' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('late')}>Late Report</Button>
            <Button variant="outline" size="sm" onClick={nextMonth} data-testid="next-month"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[['P','Present','bg-green-100 text-green-700'],['PL','Paid Leave','bg-blue-100 text-blue-700'],['SL','Sick Leave','bg-red-100 text-red-700'],['CL','Casual Leave','bg-orange-100 text-orange-700'],['W','WFH','bg-purple-100 text-purple-700'],['H','Half Day','bg-yellow-100 text-yellow-800'],['A','Absent','bg-gray-200 text-gray-600']].map(([code, label, cls]) => (
          <span key={code} className={`px-2 py-0.5 rounded ${cls}`}>{code} = {label}</span>
        ))}
      </div>

      {viewMode === 'calendar' && monthlyAtt && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[140px] sticky left-0 bg-gray-50 z-10">Employee</th>
                    {Array.from({ length: monthlyAtt.days_in_month }, (_, i) => (
                      <th key={i + 1} className="px-1 py-2 text-center font-medium text-gray-500 min-w-[32px]">{i + 1}</th>
                    ))}
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[40px]">P</th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[40px]">A</th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[40px]">L</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthlyAtt.staff?.map(s => (
                    <tr key={s.staff_id} className="hover:bg-gray-50/50" data-testid={`att-row-${s.staff_id}`}>
                      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 border-r">
                        <p className="font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-gray-400">{s.employee_code}</p>
                      </td>
                      {Array.from({ length: monthlyAtt.days_in_month }, (_, i) => {
                        const day = s.days[String(i + 1)];
                        const dateStr = `${attYear}-${String(attMonth).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                        return (
                          <td key={i + 1} className="px-0.5 py-1 text-center cursor-pointer" onClick={() => onMarkClick(s.staff_id, dateStr)} title={`Click to mark ${s.name} for ${dateStr}`}>
                            {day ? (
                              <span className={`inline-block w-6 h-6 leading-6 rounded text-[10px] font-bold ${getStatusColor(day.status)}`} data-testid={`cell-${s.staff_id}-${i+1}`}>
                                {getStatusShort(day.status)}
                                {day.is_late && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
                              </span>
                            ) : <span className="inline-block w-6 h-6 leading-6 rounded bg-gray-50 text-gray-300">-</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-center font-bold text-green-600">{s.summary.present}</td>
                      <td className="px-2 py-1 text-center font-bold text-red-600">{s.summary.absent}</td>
                      <td className="px-2 py-1 text-center font-bold text-blue-600">{s.summary.leaves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'late' && lateReport && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Timer className="h-5 w-5 text-orange-500" />Late Arrivals - {MONTHS[attMonth - 1]} {attYear}</CardTitle></CardHeader>
          <CardContent>
            {lateReport.employees?.length === 0 ? <p className="text-gray-500 text-center py-4">No late arrivals this month!</p> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold">Employee</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold">Late Days</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold">Total Late (mins)</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold">Avg Late (mins)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lateReport.employees?.map(e => (
                    <tr key={e.staff_id}>
                      <td className="px-4 py-2 font-medium">{e.name}</td>
                      <td className="px-4 py-2 text-center"><Badge className="bg-orange-100 text-orange-700">{e.late_days}</Badge></td>
                      <td className="px-4 py-2 text-center font-bold text-red-600">{e.total_late_minutes}</td>
                      <td className="px-4 py-2 text-center">{e.late_days > 0 ? Math.round(e.total_late_minutes / e.late_days) : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== LEAVE TAB ====================
function LeaveTab({ requests, filter, setFilter, onAction }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', ''].map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} data-testid={`leave-filter-${f || 'all'}`}>
            {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Dates</th>
                <th className="px-4 py-3 text-center text-xs font-semibold">Days</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Reason</th>
                <th className="px-4 py-3 text-center text-xs font-semibold">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">No leave requests found.</td></tr>
              ) : requests.map(r => {
                const typeInfo = LEAVE_TYPES.find(t => t.value === r.leave_type);
                return (
                  <tr key={r.leave_id} data-testid={`leave-row-${r.leave_id}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.staff_name}</p>
                      <p className="text-xs text-gray-500">{r.department}</p>
                    </td>
                    <td className="px-4 py-3"><Badge className={typeInfo?.color || 'bg-gray-100'}>{typeInfo?.label || r.leave_type}</Badge></td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.start_date && new Date(r.start_date).toLocaleDateString('en-IN')}
                      {r.start_date !== r.end_date && ` - ${new Date(r.end_date).toLocaleDateString('en-IN')}`}
                      {r.is_half_day && <span className="text-xs text-yellow-600 ml-1">(Half)</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-bold">{r.days}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{r.reason || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={r.status === 'approved' ? 'bg-green-100 text-green-700' : r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'pending' && (
                        <div className="flex justify-center gap-1">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2" onClick={() => onAction(r.leave_id, 'approve')} data-testid={`approve-leave-${r.leave_id}`}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => onAction(r.leave_id, 'reject')} data-testid={`reject-leave-${r.leave_id}`}>
                            <XCircle className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PAYROLL TAB ====================
function PayrollTab({ data, month, year, setMonth, setYear, onCalculate, onViewPayslip }) {
  const totalGross = data.reduce((s, p) => s + (p.gross_earnings || 0), 0);
  const totalNet = data.reduce((s, p) => s + (p.net_pay || 0), 0);
  const totalDeductions = data.reduce((s, p) => s + (p.total_deductions || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36" data-testid="pay-month-select"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24" data-testid="pay-year-select"><SelectValue /></SelectTrigger>
              <SelectContent>{[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={onCalculate} className="bg-amber-600 hover:bg-amber-700" data-testid="calculate-salary-btn">
            <Calculator className="h-4 w-4 mr-1" />Calculate Salary
          </Button>
        </CardContent>
      </Card>

      {data.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">Total Gross</p><p className="text-xl font-bold text-blue-600">{fmt(totalGross)}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">Total Deductions</p><p className="text-xl font-bold text-red-600">{fmt(totalDeductions)}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">Total Net Pay</p><p className="text-xl font-bold text-green-600">{fmt(totalNet)}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Employee</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">Working</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">Present</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">LOP</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">Late</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Gross</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Deductions</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">Net Pay</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.map(p => (
                      <tr key={p.staff_id} data-testid={`payroll-row-${p.staff_id}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{p.staff_name}</p>
                          <p className="text-xs text-gray-500">{p.employee_code} | {p.department}</p>
                        </td>
                        <td className="px-3 py-2 text-center">{p.working_days}</td>
                        <td className="px-3 py-2 text-center text-green-600 font-medium">{p.net_days_present}</td>
                        <td className="px-3 py-2 text-center text-red-600 font-medium">{p.lop_days}</td>
                        <td className="px-3 py-2 text-center text-orange-600">{p.late_days} ({p.total_late_minutes}m)</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(p.gross_earnings)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{fmt(p.total_deductions)}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(p.net_pay)}</td>
                        <td className="px-3 py-2 text-center">
                          <Button size="sm" variant="ghost" onClick={() => onViewPayslip(p.staff_id)} data-testid={`view-payslip-${p.staff_id}`}><FileText className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ==================== PAYSLIP VIEW ====================
function PayslipView({ data }) {
  const { payroll: p, staff: s, company } = data;
  const monthName = MONTHS[(p?.month || 1) - 1];
  return (
    <div className="space-y-4" data-testid="payslip-view">
      {/* Header */}
      <div className="text-center border-b pb-4">
        <h2 className="text-xl font-bold text-gray-900">{company?.name || 'Company'}</h2>
        <p className="text-sm text-gray-500">{company?.address}</p>
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg py-2">
          <p className="font-semibold text-amber-800">Payslip for {monthName} {p?.year}</p>
        </div>
      </div>

      {/* Employee Info */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-b pb-4">
        <div className="flex justify-between"><span className="text-gray-500">Name:</span><span className="font-medium">{p?.staff_name}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Employee Code:</span><span className="font-medium">{p?.employee_code}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Department:</span><span className="font-medium">{p?.department}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Designation:</span><span className="font-medium">{p?.designation}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Bank:</span><span className="font-medium">{p?.bank_name}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Account:</span><span className="font-medium">{p?.account_number}</span></div>
      </div>

      {/* Attendance Summary */}
      <div className="border-b pb-4">
        <h4 className="font-semibold text-gray-700 mb-2">Attendance Summary</h4>
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div className="bg-gray-50 p-2 rounded text-center"><p className="text-xs text-gray-500">Working Days</p><p className="font-bold">{p?.working_days}</p></div>
          <div className="bg-green-50 p-2 rounded text-center"><p className="text-xs text-gray-500">Net Present</p><p className="font-bold text-green-600">{p?.net_days_present}</p></div>
          <div className="bg-red-50 p-2 rounded text-center"><p className="text-xs text-gray-500">LOP Days</p><p className="font-bold text-red-600">{p?.lop_days}</p></div>
          <div className="bg-orange-50 p-2 rounded text-center"><p className="text-xs text-gray-500">Late Days</p><p className="font-bold text-orange-600">{p?.late_days}</p></div>
        </div>
      </div>

      {/* Earnings & Deductions */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-gray-700 mb-2 text-green-700">Earnings</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Basic Earned</span><span className="font-medium">{fmt(p?.basic_salary)}</span></div>
            <div className="flex justify-between"><span>H.R.A.</span><span className="font-medium">{fmt(p?.hra)}</span></div>
            <div className="flex justify-between"><span>P.A.</span><span className="font-medium">{fmt(p?.pa)}</span></div>
            <div className="flex justify-between"><span>F.A.</span><span className="font-medium">{fmt(p?.fa)}</span></div>
            <div className="flex justify-between border-t pt-1 font-bold"><span>Gross Earnings</span><span className="text-green-700">{fmt(p?.gross_earnings)}</span></div>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-gray-700 mb-2 text-red-700">Deductions</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>LOP</span><span className="font-medium">{fmt(p?.lop_deduction)}</span></div>
            <div className="flex justify-between"><span>Loan</span><span className="font-medium">{fmt(p?.loan_deduction)}</span></div>
            <div className="flex justify-between"><span>Late Deduction</span><span className="font-medium">{fmt(p?.late_deduction)}</span></div>
            <div className="flex justify-between border-t pt-1 font-bold"><span>Total Deduction</span><span className="text-red-700">{fmt(p?.total_deductions)}</span></div>
          </div>
        </div>
      </div>

      {/* Net Pay */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">Net Pay</p>
        <p className="text-3xl font-bold text-amber-800">{fmt(p?.net_pay)}</p>
        <p className="text-xs text-gray-500 mt-1">Per Day: {fmt(p?.per_day_salary)}</p>
      </div>
    </div>
  );
}

// ==================== SETTINGS TAB ====================
function SettingsTab({ settings, setSettings, onSave }) {
  if (!settings) return <div className="text-center py-8 text-gray-500">Loading settings...</div>;

  const updateTiming = (dept, field, value) => {
    setSettings(prev => ({
      ...prev,
      department_timings: {
        ...prev.department_timings,
        [dept]: { ...prev.department_timings[dept], [field]: field === 'grace_minutes' ? Number(value) : value }
      }
    }));
  };

  const updateLeave = (type, field, value) => {
    setSettings(prev => ({
      ...prev,
      leave_limits: {
        ...prev.leave_limits,
        [type]: { ...prev.leave_limits[type], [field]: field === 'annual_limit' ? Number(value) : value }
      }
    }));
  };

  return (
    <div className="space-y-6">
      {/* Company Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Company Name</Label><Input value={settings.company_name || ''} onChange={e => setSettings(p => ({ ...p, company_name: e.target.value }))} data-testid="company-name-input" /></div>
          <div><Label>Company Address</Label><Input value={settings.company_address || ''} onChange={e => setSettings(p => ({ ...p, company_address: e.target.value }))} data-testid="company-address-input" /></div>
        </CardContent>
      </Card>

      {/* Department Timings */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Department Timings</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(settings.department_timings || {}).map(([dept, timing]) => (
              <div key={dept} className="grid grid-cols-4 gap-3 items-center">
                <Label className="font-medium">{dept}</Label>
                <div><Label className="text-xs text-gray-500">Start</Label><Input type="time" value={timing.start || ''} onChange={e => updateTiming(dept, 'start', e.target.value)} /></div>
                <div><Label className="text-xs text-gray-500">End</Label><Input type="time" value={timing.end || ''} onChange={e => updateTiming(dept, 'end', e.target.value)} /></div>
                <div><Label className="text-xs text-gray-500">Grace (min)</Label><Input type="number" value={timing.grace_minutes || 0} onChange={e => updateTiming(dept, 'grace_minutes', e.target.value)} /></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leave Limits */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" />Annual Leave Limits</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(settings.leave_limits || {}).map(([type, info]) => (
              <div key={type} className="grid grid-cols-3 gap-3 items-center">
                <div><Label className="font-medium">{info.name || type}</Label><p className="text-xs text-gray-500">Code: {type}</p></div>
                <div><Label className="text-xs text-gray-500">Annual Limit</Label><Input type="number" value={info.annual_limit || 0} onChange={e => updateLeave(type, 'annual_limit', e.target.value)} data-testid={`leave-limit-${type}`} /></div>
                <div className="flex items-center gap-2 pt-4">
                  <input type="checkbox" checked={info.carry_forward || false} onChange={e => updateLeave(type, 'carry_forward', e.target.checked)} />
                  <Label className="text-xs">Carry Forward</Label>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={onSave} className="bg-amber-600 hover:bg-amber-700" data-testid="save-settings-btn">Save Settings</Button>
    </div>
  );
}
