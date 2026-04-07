import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, LogOut, HardHat, MapPin, Package, Users, ChevronRight,
  Clock, Menu, X, ClipboardList, DollarSign, CheckCircle, Play, AlertCircle, Truck,
  Wallet, Plus, Receipt, Send, Video, MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { Label } from '@/components/ui/label';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Eye } from 'lucide-react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icon
const defaultIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = defaultIcon;

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

// ============ MINI CASHBOOK SECTION ============
function MiniCashbookSection({ projects }) {
  const [cashbookData, setCashbookData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('');
  const [financeTab, setFinanceTab] = useState('income');
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ project_id: '', category: 'material', amount: '', description: '', vendor_name: '' });

  useEffect(() => {
    fetchCashbook(false);
  }, [selectedProject]);

  const fetchCashbook = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const params = selectedProject ? `?project_id=${selectedProject}` : '';
      const res = await axios.get(`${API}/site-engineer/mini-cashbook${params}`);
      setCashbookData(res.data);
    } catch (err) {
      console.error('Failed to load mini cashbook:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordExpense = async () => {
    if (!newExpense.project_id || !newExpense.amount || !newExpense.description) {
      toast.error('Project, amount and description required'); return;
    }
    try {
      await axios.post(`${API}/accountant/record-expense`, {
        project_id: newExpense.project_id,
        category: newExpense.category,
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        payment_method: 'petty_cash',
        vendor_name: newExpense.vendor_name || null,
      });
      toast.success('Expense recorded');
      setAddExpenseOpen(false);
      setNewExpense({ project_id: '', category: 'material', amount: '', description: '', vendor_name: '' });
      fetchCashbook(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to record expense');
    }
  };

  const cashbooks = cashbookData?.cashbooks || [];
  const summary = cashbookData?.summary || {};

  return (
    <div className="space-y-4" data-testid="mini-cashbook-section">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Issued</p>
            <p className="text-lg font-bold text-green-700">{fmtFull(summary.total_issued)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Spent</p>
            <p className="text-lg font-bold text-red-600">{fmtFull(summary.total_spent)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Balance</p>
            <p className={`text-lg font-bold ${(summary.total_balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {fmtFull(summary.total_balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Project Filter */}
      <div className="flex gap-2 items-center">
        <Select value={selectedProject || 'all'} onValueChange={v => setSelectedProject(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid="cashbook-project-select">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1 h-8 ml-auto" onClick={() => setAddExpenseOpen(true)} data-testid="se-add-expense">
          <Plus className="h-3.5 w-3.5" /> Record Expense
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : cashbooks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">No cashbook entries yet. Request petty cash to get started.</CardContent></Card>
      ) : (
        cashbooks.map(cb => (
          <Card key={cb.project_id} data-testid={`cashbook-project-${cb.project_id}`}>
            <CardHeader className="py-2 px-4 border-b bg-gray-50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{cb.project_name}</CardTitle>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 font-semibold">Issued: {fmtFull(cb.total_issued)}</span>
                  <span className="text-red-600 font-semibold">Spent: {fmtFull(cb.total_spent)}</span>
                  <Badge className={cb.balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    Bal: {fmtFull(cb.balance)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="petty_cash">
                <TabsList className="grid grid-cols-2 w-full max-w-xs ml-3 mt-2">
                  <TabsTrigger value="petty_cash" className="text-xs gap-1 data-[state=active]:bg-green-100">
                    <ArrowDownRight className="h-3 w-3" /> Income ({cb.petty_cash_entries.length})
                  </TabsTrigger>
                  <TabsTrigger value="expenses" className="text-xs gap-1 data-[state=active]:bg-red-100">
                    <ArrowUpRight className="h-3 w-3" /> Expense ({cb.expense_entries.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="petty_cash" className="mt-0">
                  <table className="w-full text-xs">
                    <thead className="bg-green-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Date</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Purpose</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Status</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Requested</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Issued</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Spent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cb.petty_cash_entries.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-4 text-gray-400">No petty cash entries</td></tr>
                      ) : cb.petty_cash_entries.map((pc, i) => (
                        <tr key={pc.petty_cash_id || i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">{new Date(pc.created_at).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-1.5 font-medium">{pc.purpose || '-'}</td>
                          <td className="px-3 py-1.5">
                            <Badge className={
                              pc.status === 'issued' ? 'bg-green-100 text-green-700' :
                              pc.status === 'requested' ? 'bg-amber-100 text-amber-700' :
                              pc.status === 'settled' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }>{pc.status}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtFull(pc.amount_requested)}</td>
                          <td className="px-3 py-1.5 text-right text-green-700 font-semibold">{fmtFull(pc.amount_issued)}</td>
                          <td className="px-3 py-1.5 text-right text-red-600">{fmtFull(pc.amount_spent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
                <TabsContent value="expenses" className="mt-0">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Date</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Category</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Description</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Vendor</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cb.expense_entries.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-4 text-gray-400">No expenses recorded</td></tr>
                      ) : cb.expense_entries.map((e, i) => (
                        <tr key={e.expense_id || i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">{new Date(e.created_at).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-1.5"><Badge className="bg-blue-100 text-blue-700 text-[10px]">{e.category}</Badge></td>
                          <td className="px-3 py-1.5">{e.description || '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{e.vendor_name || '-'}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-red-600">{fmtFull(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ))
      )}

      {/* Record Expense Dialog */}
      <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Project *</Label>
              <Select value={newExpense.project_id} onValueChange={v => setNewExpense(p => ({...p, project_id: v}))}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Category</Label>
              <Select value={newExpense.category} onValueChange={v => setNewExpense(p => ({...p, category: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="labour">Labour</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount *</Label><NumericInput value={newExpense.amount} onChange={e => setNewExpense(p => ({...p, amount: e.target.value}))} /></div>
            <div><Label>Description *</Label><Input value={newExpense.description} onChange={e => setNewExpense(p => ({...p, description: e.target.value}))} /></div>
            <div><Label>Vendor</Label><Input value={newExpense.vendor_name} onChange={e => setNewExpense(p => ({...p, vendor_name: e.target.value}))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddExpenseOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleRecordExpense}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SiteEngineerDashboard() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');
  
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [paymentRemarks, setPaymentRemarks] = useState('');
  
  // Petty Cash states
  const [pettyCashList, setPettyCashList] = useState([]);
  const [pettyCashDialog, setPettyCashDialog] = useState(false);
  const [pettyCashExpenseDialog, setPettyCashExpenseDialog] = useState(false);
  const [selectedPettyCash, setSelectedPettyCash] = useState(null);
  const [pettyCashForm, setPettyCashForm] = useState({
    project_id: '',
    amount: '',
    purpose: '',
    remarks: ''
  });
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    expense_type: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Attendance states
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [attLoginDialog, setAttLoginDialog] = useState(false);
  const [attSelectedProject, setAttSelectedProject] = useState('');
  const [attLoading, setAttLoading] = useState(false);
  const [gpsPosition, setGpsPosition] = useState(null);
  const [gpsError, setGpsError] = useState(null);

  // Curing Video states
  const [curingDialog, setCuringDialog] = useState(false);
  const [curingProject, setCuringProject] = useState('');
  const [curingDone, setCuringDone] = useState(false);
  const [curingLoading, setCuringLoading] = useState(false);
  const [curingHistory, setCuringHistory] = useState([]);
  const [curingHistoryLoading, setCuringHistoryLoading] = useState(false);
  const [curingFilterProject, setCuringFilterProject] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, projectsRes, workOrdersRes, pettyCashRes, attTodayRes, attHistRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/site-engineer/my-projects`),
        axios.get(`${API}/site-engineer/work-orders`).catch(() => ({ data: [] })),
        axios.get(`${API}/site-engineer/petty-cash`).catch(() => ({ data: [] })),
        axios.get(`${API}/attendance/my-today`).catch(() => ({ data: null })),
        axios.get(`${API}/attendance/my-history`).catch(() => ({ data: [] }))
      ]);
      setUser(userRes.data);
      setProjects(projectsRes.data);
      setWorkOrders(workOrdersRes.data);
      setPettyCashList(pettyCashRes.data);
      setTodayAttendance(attTodayRes.data);
      setAttendanceHistory(attHistRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. Only Site Engineers can access this page.');
        window.location.href = '/dashboard';
      } else {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  // ============ CURING VIDEO FUNCTIONS ============
  const fetchCuringHistory = async (projFilter) => {
    setCuringHistoryLoading(true);
    try {
      const params = projFilter && projFilter !== 'all' ? `?project_id=${projFilter}` : '';
      const res = await axios.get(`${API}/site-engineer/curing-video/history${params}`);
      setCuringHistory(res.data || []);
    } catch { setCuringHistory([]); }
    setCuringHistoryLoading(false);
  };

  const handleCuringSubmit = async () => {
    if (!curingProject) { toast.error('Please select a project'); return; }
    setCuringLoading(true);
    try {
      const res = await axios.post(`${API}/site-engineer/curing-video`, {
        project_id: curingProject,
        curing_done: curingDone,
      });
      toast.success('Curing video record saved!');
      const record = res.data;
      // If curing is done, open WhatsApp
      if (curingDone && record.client_phone) {
        const phone = record.client_phone.replace(/[\s\-\+]/g, '');
        const msg = encodeURIComponent(`Curing video done for project: ${record.project_name} on ${new Date().toLocaleDateString('en-IN')}. - ${user?.name || 'Site Engineer'}`);
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
        // Mark whatsapp sent
        await axios.patch(`${API}/site-engineer/curing-video/${record.record_id}/whatsapp-sent`).catch(() => {});
      }
      setCuringDialog(false);
      setCuringProject('');
      setCuringDone(false);
      fetchCuringHistory(curingFilterProject);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save curing record');
    }
    setCuringLoading(false);
  };

  const handleWhatsAppResend = async (record) => {
    const phone = (record.client_phone || '').replace(/[\s\-\+]/g, '');
    if (!phone) { toast.error('No client phone number'); return; }
    const msg = encodeURIComponent(`Curing video done for project: ${record.project_name} on ${new Date(record.date_time).toLocaleDateString('en-IN')}. - ${user?.name || 'Site Engineer'}`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    await axios.patch(`${API}/site-engineer/curing-video/${record.record_id}/whatsapp-sent`).catch(() => {});
    fetchCuringHistory(curingFilterProject);
  };
  
  // Petty Cash Functions
  const handleRequestPettyCash = async () => {
    if (!pettyCashForm.project_id || !pettyCashForm.amount || !pettyCashForm.purpose) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await axios.post(`${API}/site-engineer/petty-cash/request`, {
        project_id: pettyCashForm.project_id,
        amount: parseFloat(pettyCashForm.amount),
        purpose: pettyCashForm.purpose,
        remarks: pettyCashForm.remarks
      });
      toast.success('Petty cash requested! Goes to Accountant for approval.');
      setPettyCashDialog(false);
      setPettyCashForm({ project_id: '', amount: '', purpose: '', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request petty cash');
    }
  };
  
  const handleAddExpense = async () => {
    if (!expenseForm.amount || !expenseForm.expense_type || !expenseForm.description) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await axios.post(`${API}/site-engineer/petty-cash/${selectedPettyCash.petty_cash_id}/expense`, {
        petty_cash_id: selectedPettyCash.petty_cash_id,
        amount: parseFloat(expenseForm.amount),
        expense_type: expenseForm.expense_type,
        description: expenseForm.description,
        date: expenseForm.date
      });
      toast.success('Expense added');
      setPettyCashExpenseDialog(false);
      setExpenseForm({ amount: '', expense_type: '', description: '', date: new Date().toISOString().split('T')[0] });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add expense');
    }
  };
  
  const handleSubmitPettyCash = async (pettyCashId) => {
    try {
      await axios.post(`${API}/site-engineer/petty-cash/${pettyCashId}/submit`);
      toast.success('Petty cash submitted! Goes to Accountant for settlement.');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit petty cash');
    }
  };

  // Attendance functions
  const getGPS = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject('GPS not available'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(err.message || 'GPS denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  const currentlyLoggedProject = todayAttendance?.entries?.find(e => !e.logout_time);

  // Background GPS tracking every 5 minutes when logged in
  useEffect(() => {
    if (!currentlyLoggedProject) return;
    const trackLocation = async () => {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            () => reject(), { enableHighAccuracy: true, timeout: 10000 }
          );
        });
        const res = await axios.post(`${API}/attendance/track-location`, pos);
        if (res.data.status === 'auto_logout') {
          toast.error(res.data.message);
          fetchData(false);
        }
      } catch { /* GPS unavailable, skip silently */ }
    };
    trackLocation(); // Track immediately
    const interval = setInterval(trackLocation, 5 * 60 * 1000); // Every 5 min
    return () => clearInterval(interval);
  }, [currentlyLoggedProject?.project_id]);

  const handleAttLogin = async () => {
    if (!attSelectedProject) { toast.error('Select a project site'); return; }
    setAttLoading(true);
    try {
      let gps = { latitude: null, longitude: null };
      try { gps = await getGPS(); } catch { toast.info('GPS unavailable — logging without location'); }
      await axios.post(`${API}/attendance/login`, {
        project_id: attSelectedProject,
        latitude: gps.latitude,
        longitude: gps.longitude
      });
      toast.success('Logged in to site!');
      setAttLoginDialog(false);
      setAttSelectedProject('');
      fetchData(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Login failed');
    }
    setAttLoading(false);
  };

  const handleAttLogout = async (projectId) => {
    setAttLoading(true);
    try {
      let gps = { latitude: null, longitude: null };
      try { gps = await getGPS(); } catch {}
      const res = await axios.post(`${API}/attendance/logout`, {
        project_id: projectId,
        latitude: gps.latitude,
        longitude: gps.longitude
      });
      toast.success(res.data.message);
      fetchData(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Logout failed');
    }
    setAttLoading(false);
  };

  const getStatusBadge = (status) => {
    const cfg = {
      full_day: { label: 'Full Day', cls: 'bg-green-100 text-green-700' },
      half_day: { label: 'Half Day', cls: 'bg-amber-100 text-amber-700' },
      short_day: { label: 'Short Day', cls: 'bg-red-100 text-red-700' },
      present: { label: 'Present', cls: 'bg-blue-100 text-blue-700' },
      absent: { label: 'Absent', cls: 'bg-gray-100 text-gray-500' },
    };
    const c = cfg[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
    return <Badge className={c.cls}>{c.label}</Badge>;
  };
  
  const getPettyCashStatusBadge = (status) => {
    const config = {
      requested: { label: 'Requested', className: 'bg-yellow-100 text-yellow-700' },
      issued: { label: 'Issued', className: 'bg-green-100 text-green-700' },
      partially_spent: { label: 'In Use', className: 'bg-amber-50 text-amber-700' },
      pending_settlement: { label: 'Pending Settlement', className: 'bg-orange-100 text-orange-700' },
      settled: { label: 'Settled', className: 'bg-gray-100 text-gray-700' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const handleStartStage = async (workOrderId, stageId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/stages/${stageId}/start`);
      toast.success('Stage started');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to start stage');
    }
  };

  const handleCompleteStage = async (workOrderId, stageId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/stages/${stageId}/complete`);
      toast.success('Stage marked as completed');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to complete stage');
    }
  };

  const openPaymentRequest = (workOrder, stage) => {
    setSelectedStage({ workOrder, stage });
    setPaymentRemarks('');
    setPaymentDialog(true);
  };

  const handleRequestPayment = async () => {
    if (!selectedStage) return;
    
    try {
      await axios.patch(
        `${API}/work-orders/${selectedStage.workOrder.work_order_id}/stages/${selectedStage.stage.stage_id}/request-payment`,
        null,
        { params: { remarks: paymentRemarks } }
      );
      toast.success('Payment request submitted! Goes to Planning for approval.');
      setPaymentDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request payment');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getStageStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
      in_progress: { label: 'In Progress', className: 'bg-amber-50 text-amber-700' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
      payment_requested: { label: 'Payment Requested', className: 'bg-orange-100 text-orange-700' },
      payment_approved: { label: 'Approved', className: 'bg-purple-100 text-purple-700' },
      paid: { label: 'Paid', className: 'bg-green-200 text-green-800' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
  };

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== 'site_engineer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <HardHat className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">This page is only accessible to Site Engineers.</p>
            <Button onClick={() => window.location.href = '/dashboard'} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-friendly Navigation */}
      <nav className="bg-gradient-to-r from-orange-600 to-orange-700 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-white/20 p-1.5 sm:p-2 rounded-lg">
              <HardHat className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white">Site Engineer</h1>
              <p className="text-xs text-orange-100 hidden sm:block">My Projects</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Attendance Login/Logout Button */}
            {currentlyLoggedProject ? (
              <Button
                className="bg-red-500 hover:bg-red-600 text-white h-8 text-xs sm:text-sm animate-pulse"
                onClick={() => handleAttLogout(currentlyLoggedProject.project_id)}
                disabled={attLoading}
                data-testid="att-logout-btn"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Logout {currentlyLoggedProject.project_name}</span>
                <span className="sm:hidden">Logout</span>
              </Button>
            ) : (
              <Button
                className="bg-green-500 hover:bg-green-600 text-white h-8 text-xs sm:text-sm"
                onClick={() => setAttLoginDialog(true)}
                data-testid="att-login-btn"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Site Login</span>
                <span className="sm:hidden">Login</span>
              </Button>
            )}
            <Button 
              variant="outline" 
              className="text-white border-white/50 hover:bg-orange-500 h-8 text-xs sm:text-sm"
              onClick={() => window.location.href = '/site-engineer/material-receipt'}
            >
              <Package className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Material Receipt</span>
              <span className="sm:hidden">Receipt</span>
            </Button>
            <Button 
              variant="outline" 
              className="text-white border-white/50 hover:bg-orange-500 h-8 text-xs sm:text-sm"
              onClick={() => { setCuringDialog(true); setCuringProject(''); setCuringDone(false); }}
              data-testid="curing-video-btn"
            >
              <Video className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Curing Video</span>
              <span className="sm:hidden">Curing</span>
            </Button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-orange-100">Site Engineer</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-orange-500 h-8 w-8 sm:h-10 sm:w-10">
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
        {/* Mobile user info */}
        <div className="sm:hidden mt-2 pt-2 border-t border-orange-400/50">
          <p className="text-sm text-white">{user.name}</p>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h2 data-testid="site-engineer-title" className="text-xl sm:text-3xl font-bold text-gray-900">My Projects</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Select a project to manage materials and labour</p>
        </div>

        {/* Stats - Stack on mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Assigned</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Building2 className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600" />
                <span className="text-lg sm:text-2xl font-bold text-orange-700">{projects.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600" />
                <span className="text-lg sm:text-2xl font-bold text-amber-700">
                  {projects.reduce((acc, p) => acc + (p.active_orders || 0), 0)}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active Sites</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <MapPin className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
                <span className="text-lg sm:text-2xl font-bold text-green-700">
                  {projects.filter(p => p.status === 'active').length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Projects, Work Orders, Petty Cash, and Mini Cashbook */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="projects" className="gap-2">
              <Building2 className="h-4 w-4" /> Projects
            </TabsTrigger>
            <TabsTrigger value="sitevisits" className="gap-2" data-testid="tab-site-visits">
              <MapPin className="h-4 w-4" /> Site Visits
            </TabsTrigger>
            <TabsTrigger value="workorders" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Work Orders
              {workOrders.filter(w => w.status === 'assigned' || w.status === 'in_progress').length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {workOrders.filter(w => w.status === 'assigned' || w.status === 'in_progress').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pettycash" className="gap-2">
              <Wallet className="h-4 w-4" /> Petty Cash
              {pettyCashList.filter(p => p.status === 'issued' || p.status === 'partially_spent').length > 0 && (
                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-500">
                  {pettyCashList.filter(p => p.status === 'issued' || p.status === 'partially_spent').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="minicashbook" className="gap-2" data-testid="tab-mini-cashbook">
              <Receipt className="h-4 w-4" /> Mini Cashbook
            </TabsTrigger>
            <TabsTrigger value="curingvideo" className="gap-2" data-testid="tab-curing-video" onClick={() => fetchCuringHistory(curingFilterProject)}>
              <Video className="h-4 w-4" /> Curing Video
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2" data-testid="tab-attendance">
              <Clock className="h-4 w-4" /> Attendance
            </TabsTrigger>
          </TabsList>

          {/* Site Visits Tab */}
          <TabsContent value="sitevisits" className="mt-4">
            <SiteVisitsSection user={user} />
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-4">
            {/* Project Locations Map */}
            {(() => {
              const geoProjects = projects.filter(p => p.latitude && p.longitude);
              if (geoProjects.length === 0) return null;
              const center = [geoProjects[0].latitude, geoProjects[0].longitude];
              return (
                <Card className="mb-4" data-testid="project-map-card">
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-orange-600" /> Project Locations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-2">
                    <div className="rounded-lg overflow-hidden border" style={{ height: '280px' }}>
                      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {geoProjects.map(p => (
                          <Marker key={p.project_id} position={[p.latitude, p.longitude]}>
                            <Popup>
                              <div className="text-xs min-w-[150px]">
                                <p className="font-bold text-sm mb-1">{p.name}</p>
                                <p className="text-gray-600">{p.location || 'No address'}</p>
                                <p className="text-gray-500">{p.client_name}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{p.latitude?.toFixed(4)}, {p.longitude?.toFixed(4)}</p>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{geoProjects.length} of {projects.length} projects with GPS coordinates</p>
                  </CardContent>
                </Card>
              );
            })()}

            {projects.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center">
                  <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Projects Assigned</h3>
                  <p className="text-sm text-gray-600">
                    You haven't been assigned to any projects yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {projects.map((project) => (
                  <Card 
                    key={project.project_id} 
                    data-testid={`project-card-${project.project_id}`}
                    className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-orange-500 active:bg-gray-50"
                    onClick={() => window.location.href = `/site-engineer/project/${project.project_id}`}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-base sm:text-xl font-bold text-gray-900 truncate">{project.name}</h3>
                            <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {project.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1 sm:gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">{project.client_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">{project.location}</span>
                              {project.latitude && project.longitude && (
                                <span className="text-[9px] text-green-600 bg-green-50 px-1 rounded">GPS</span>
                              )}
                            </div>
                          </div>
                          {project.active_orders > 0 && (
                            <div className="mt-2 sm:mt-3">
                              <div className="inline-flex items-center gap-1.5 bg-orange-100 px-2 py-1 rounded-lg">
                                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
                                <span className="text-xs sm:text-sm font-medium text-orange-700">
                                  {project.active_orders} Active Orders
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Work Orders Tab */}
          <TabsContent value="workorders" className="mt-4">
            {workOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center">
                  <ClipboardList className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Work Orders</h3>
                  <p className="text-sm text-gray-600">
                    No work orders have been assigned to you yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {workOrders.map((wo) => (
                  <Card key={wo.work_order_id} className="border-l-4 border-l-indigo-500">
                    <CardContent className="p-4">
                      {/* Work Order Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {wo.order_type === 'labour' ? (
                              <Users className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Package className="h-4 w-4 text-green-600" />
                            )}
                            <span className="font-bold">{wo.work_order_number}</span>
                            <Badge variant={wo.order_type === 'labour' ? 'default' : 'secondary'}>
                              {wo.order_type}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium">
                            {wo.order_type === 'labour' ? wo.work_type : wo.material_name}
                            {wo.brand && <span className="text-gray-500"> - {wo.brand}</span>}
                          </p>
                          <p className="text-xs text-gray-500">Project: {wo.project_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(wo.total_amount)}</p>
                        </div>
                      </div>

                      {/* Payment Stages for Labour Orders */}
                      {wo.order_type === 'labour' && wo.stages && wo.stages.length > 0 && (
                        <div className="border-t pt-3">
                          <p className="text-xs font-semibold text-gray-500 mb-2">PAYMENT STAGES</p>
                          <div className="space-y-2">
                            {wo.stages.map((stage, idx) => (
                              <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                      Stage {stage.stage_number}: {stage.stage_name}
                                    </span>
                                    {getStageStatusBadge(stage.status)}
                                  </div>
                                  <span className="font-bold text-green-600">{formatCurrency(stage.amount)}</span>
                                </div>
                                
                                {/* Stage Actions */}
                                <div className="flex gap-2 flex-wrap">
                                  {stage.status === 'pending' && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleStartStage(wo.work_order_id, stage.stage_id)}
                                      className="gap-1"
                                    >
                                      <Play className="h-3 w-3" /> Start Work
                                    </Button>
                                  )}
                                  
                                  {stage.status === 'in_progress' && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleCompleteStage(wo.work_order_id, stage.stage_id)}
                                      className="gap-1"
                                    >
                                      <CheckCircle className="h-3 w-3" /> Mark Complete
                                    </Button>
                                  )}
                                  
                                  {(stage.status === 'completed' || stage.status === 'in_progress') && stage.status !== 'payment_requested' && stage.status !== 'payment_approved' && stage.status !== 'paid' && (
                                    <Button 
                                      size="sm"
                                      onClick={() => openPaymentRequest(wo, stage)}
                                      className="gap-1 bg-orange-600 hover:bg-orange-700"
                                    >
                                      <DollarSign className="h-3 w-3" /> Request Payment
                                    </Button>
                                  )}
                                  
                                  {stage.status === 'payment_requested' && (
                                    <span className="text-xs text-orange-600 flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> Waiting for Planning approval
                                    </span>
                                  )}
                                  
                                  {stage.status === 'payment_approved' && (
                                    <span className="text-xs text-purple-600 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Approved - Awaiting payment
                                    </span>
                                  )}
                                  
                                  {stage.status === 'paid' && (
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Payment completed
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Petty Cash Tab */}
          <TabsContent value="pettycash" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Petty Cash</h3>
              <Button onClick={() => setPettyCashDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Request Petty Cash
              </Button>
            </div>
            
            {pettyCashList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Petty Cash</h3>
                  <p className="text-sm text-gray-600">Request petty cash for site expenses</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pettyCashList.map((pc) => (
                  <Card key={pc.petty_cash_id} className="border-l-4 border-l-green-500">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{pc.project_name}</h4>
                            {getPettyCashStatusBadge(pc.status)}
                          </div>
                          <p className="text-sm text-gray-600">{pc.purpose}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">₹{pc.amount_issued || pc.amount_requested}</p>
                          <p className="text-xs text-gray-500">
                            Spent: ₹{pc.amount_spent || 0}
                          </p>
                        </div>
                      </div>
                      
                      {/* Expenses List */}
                      {pc.expenses && pc.expenses.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Expenses ({pc.expenses.length})</p>
                          <div className="space-y-1">
                            {pc.expenses.slice(-3).map((exp, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-gray-600">{exp.description}</span>
                                <span className="font-medium">₹{exp.amount}</span>
                              </div>
                            ))}
                            {pc.expenses.length > 3 && (
                              <p className="text-xs text-gray-400">...and {pc.expenses.length - 3} more</p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-wrap">
                        {(pc.status === 'issued' || pc.status === 'partially_spent') && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedPettyCash(pc);
                                setPettyCashExpenseDialog(true);
                              }}
                            >
                              <Receipt className="h-4 w-4 mr-1" /> Add Expense
                            </Button>
                            <Button 
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700"
                              onClick={() => handleSubmitPettyCash(pc.petty_cash_id)}
                            >
                              <Send className="h-4 w-4 mr-1" /> Submit for Settlement
                            </Button>
                          </>
                        )}
                        {pc.status === 'pending_settlement' && (
                          <Badge className="bg-orange-100 text-orange-700">Waiting for Accountant</Badge>
                        )}
                        {pc.status === 'settled' && (
                          <Badge className="bg-green-100 text-green-700">Settled ✓</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Mini Cashbook Tab */}
          <TabsContent value="minicashbook" className="mt-4">
            <MiniCashbookSection projects={projects} />
          </TabsContent>

          {/* CURING VIDEO HISTORY TAB */}
          <TabsContent value="curingvideo" className="mt-4" data-testid="curing-video-tab">
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Video className="h-4 w-4 text-purple-600" /> Curing Video History
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">Records created via Curing Video popup</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={curingFilterProject} onValueChange={(v) => { setCuringFilterProject(v); fetchCuringHistory(v); }}>
                      <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="curing-filter-project">
                        <SelectValue placeholder="All Projects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700 h-8 text-xs" onClick={() => { setCuringDialog(true); setCuringProject(''); setCuringDone(false); }} data-testid="curing-add-record-btn">
                      <Plus className="h-3.5 w-3.5 mr-1" /> New Record
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {curingHistoryLoading ? (
                  <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-purple-600" /></div>
                ) : curingHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Video className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No curing video records yet</p>
                    <p className="text-xs mt-1">Use the "Curing Video" button in the header to add records</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm" data-testid="curing-history-table">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Date & Time</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Project</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600">Curing Video</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600">WhatsApp</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {curingHistory.map((r) => (
                          <tr key={r.record_id} className="border-b hover:bg-gray-50" data-testid={`curing-row-${r.record_id}`}>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="text-sm font-medium">{new Date(r.date_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                              <div className="text-xs text-gray-400">{new Date(r.date_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-gray-900">{r.project_name}</div>
                              <div className="text-xs text-gray-400">{r.client_name}</div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {r.curing_done ? (
                                <Badge className="bg-green-100 text-green-700" data-testid={`curing-status-${r.record_id}`}>Done</Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-500" data-testid={`curing-status-${r.record_id}`}>Not Done</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {r.whatsapp_sent ? (
                                <Badge className="bg-green-100 text-green-700" data-testid={`wa-status-${r.record_id}`}>Sent</Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-600" data-testid={`wa-status-${r.record_id}`}>Not Sent</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {!r.whatsapp_sent && r.curing_done && r.client_phone && (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => handleWhatsAppResend(r)} data-testid={`wa-resend-${r.record_id}`}>
                                  <MessageCircle className="h-3.5 w-3.5 mr-1" /> Send
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ATTENDANCE TAB */}
          <TabsContent value="attendance" className="mt-4" data-testid="attendance-tab">
            <Card>
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-600" />Daily Attendance
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">Multi-site time tracking</p>
                  </div>
                  {!currentlyLoggedProject ? (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs" onClick={() => setAttLoginDialog(true)} data-testid="att-login-tab-btn">
                      <Play className="h-3 w-3 mr-1" /> Site Login
                    </Button>
                  ) : (
                    <Button size="sm" className="bg-red-500 hover:bg-red-600 text-xs" onClick={() => handleAttLogout(currentlyLoggedProject.project_id)} disabled={attLoading}>
                      <LogOut className="h-3 w-3 mr-1" /> Logout {currentlyLoggedProject.project_name}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                {/* Today's Summary */}
                {todayAttendance && todayAttendance.entries?.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3" data-testid="att-today-summary">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-orange-700">Today - {todayAttendance.date}</span>
                      {getStatusBadge(todayAttendance.status)}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {todayAttendance.entries.map((e, i) => (
                        <div key={i} className={`rounded-lg p-2 text-center text-xs ${!e.logout_time ? 'bg-green-100 border border-green-300' : 'bg-white border'}`}>
                          <p className="font-semibold truncate">{e.project_name}</p>
                          <p className="text-gray-600">{e.login_time} - {e.logout_time || <span className="text-green-600 font-bold">Active</span>}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-gray-500">Total: <span className="font-bold text-orange-700">{todayAttendance.total_hours}h</span></span>
                      <span className="text-gray-500">{todayAttendance.entries.length} site(s) visited</span>
                    </div>
                  </div>
                )}

                {/* History Table */}
                <div className="border rounded-lg overflow-hidden" data-testid="att-history-table">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-800 text-white">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium">Date</th>
                        {/* Dynamic project columns from all unique projects */}
                        {(() => {
                          const allProjects = new Map();
                          [todayAttendance, ...attendanceHistory].filter(Boolean).forEach(r => {
                            (r.entries || []).forEach(e => {
                              if (!allProjects.has(e.project_id)) allProjects.set(e.project_id, e.project_name);
                            });
                          });
                          return Array.from(allProjects.entries()).map(([pid, pname]) => (
                            <th key={pid} className="px-2 py-2.5 text-center font-medium bg-orange-700">
                              <span className="truncate block max-w-[100px]">{pname}</span>
                            </th>
                          ));
                        })()}
                        <th className="px-2 py-2.5 text-center font-medium bg-blue-700">Total Hours</th>
                        <th className="px-2 py-2.5 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        const allProjects = new Map();
                        const allRecords = [todayAttendance, ...attendanceHistory].filter(Boolean);
                        // Deduplicate by date
                        const seen = new Set();
                        const uniqueRecords = allRecords.filter(r => {
                          if (seen.has(r.date)) return false;
                          seen.add(r.date);
                          return true;
                        });
                        uniqueRecords.forEach(r => {
                          (r.entries || []).forEach(e => {
                            if (!allProjects.has(e.project_id)) allProjects.set(e.project_id, e.project_name);
                          });
                        });
                        const projectIds = Array.from(allProjects.keys());

                        if (uniqueRecords.length === 0) return (
                          <tr><td colSpan={projectIds.length + 3} className="text-center py-8 text-gray-400">No attendance records yet. Click "Site Login" to start tracking.</td></tr>
                        );

                        return uniqueRecords.map((r, ri) => (
                          <tr key={r.date} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2 font-medium whitespace-nowrap">
                              {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })}
                            </td>
                            {projectIds.map(pid => {
                              const entry = (r.entries || []).find(e => e.project_id === pid);
                              return (
                                <td key={pid} className="px-2 py-2 text-center">
                                  {entry ? (
                                    <div>
                                      <span className="text-green-700">{entry.login_time}</span>
                                      <span className="text-gray-400"> - </span>
                                      <span className="text-red-600">{entry.logout_time || <span className="text-green-600 font-bold text-[10px]">Active</span>}</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center font-bold">{r.total_hours}h</td>
                            <td className="px-2 py-2 text-center">{getStatusBadge(r.status)}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Attendance Login Dialog */}
      <Dialog open={attLoginDialog} onOpenChange={setAttLoginDialog}>
        <DialogContent className="max-w-sm" data-testid="att-login-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-green-600" /> Site Login
            </DialogTitle>
            <DialogDescription>Select a project site to login. GPS will be captured automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Select Project Site</Label>
              <Select value={attSelectedProject} onValueChange={setAttSelectedProject}>
                <SelectTrigger data-testid="att-project-select">
                  <SelectValue placeholder="Choose site..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.name} - {p.location || 'No location'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-gray-500">Your current GPS location will be captured and verified against the project site (5km radius).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttLoginDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleAttLogin} disabled={attLoading} data-testid="att-confirm-login">
              {attLoading ? 'Locating...' : 'Login to Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Stage Payment</DialogTitle>
            <DialogDescription>
              Submit payment request for approval by Planning
            </DialogDescription>
          </DialogHeader>
          
          {selectedStage && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">Work Order</p>
                  <p className="font-semibold">{selectedStage.workOrder.work_order_number} - {selectedStage.workOrder.work_type}</p>
                  <p className="text-sm text-gray-500 mt-2">Stage</p>
                  <p className="font-semibold">{selectedStage.stage.stage_name}</p>
                  <p className="text-xl font-bold text-green-600 mt-2">
                    {formatCurrency(selectedStage.stage.amount)}
                  </p>
                </CardContent>
              </Card>
              
              <div>
                <label className="text-sm font-medium">Remarks (Optional)</label>
                <Textarea 
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                  placeholder="Add any notes for Planning..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestPayment} className="bg-orange-600 hover:bg-orange-700">
              <DollarSign className="h-4 w-4 mr-2" /> Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petty Cash Request Dialog */}
      <Dialog open={pettyCashDialog} onOpenChange={setPettyCashDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Petty Cash</DialogTitle>
            <DialogDescription>
              Request petty cash for site expenses. Will be sent to Accountant for approval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Project *</label>
              <Select 
                value={pettyCashForm.project_id} 
                onValueChange={(v) => setPettyCashForm({...pettyCashForm, project_id: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Amount *</label>
              <NumericInput 
                
                value={pettyCashForm.amount}
                onChange={(e) => setPettyCashForm({...pettyCashForm, amount: e.target.value})}
                placeholder="Enter amount"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Purpose *</label>
              <Input 
                value={pettyCashForm.purpose}
                onChange={(e) => setPettyCashForm({...pettyCashForm, purpose: e.target.value})}
                placeholder="e.g., Site expenses for week"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Remarks</label>
              <Textarea 
                value={pettyCashForm.remarks}
                onChange={(e) => setPettyCashForm({...pettyCashForm, remarks: e.target.value})}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPettyCashDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestPettyCash} className="bg-green-600 hover:bg-green-700">
              <Wallet className="h-4 w-4 mr-2" /> Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petty Cash Expense Dialog */}
      <Dialog open={pettyCashExpenseDialog} onOpenChange={setPettyCashExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Record an expense from your petty cash
            </DialogDescription>
          </DialogHeader>
          
          {selectedPettyCash && (
            <div className="space-y-4">
              <Card className="bg-green-50">
                <CardContent className="p-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Available Balance</p>
                      <p className="text-xl font-bold text-green-600">
                        ₹{(selectedPettyCash.amount_issued - selectedPettyCash.amount_spent).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total Issued</p>
                      <p className="font-semibold">₹{selectedPettyCash.amount_issued?.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div>
                <label className="text-sm font-medium">Amount *</label>
                <NumericInput 
                  
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  placeholder="Expense amount"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Expense Type *</label>
                <Select 
                  value={expenseForm.expense_type}
                  onValueChange={(v) => setExpenseForm({...expenseForm, expense_type: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="food">Food & Refreshments</SelectItem>
                    <SelectItem value="tools">Tools & Equipment</SelectItem>
                    <SelectItem value="misc">Miscellaneous</SelectItem>
                    <SelectItem value="printing">Printing & Stationery</SelectItem>
                    <SelectItem value="courier">Courier & Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Description *</label>
                <Input 
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  placeholder="Brief description of expense"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input 
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPettyCashExpenseDialog(false)}>Cancel</Button>
            <Button onClick={handleAddExpense} className="bg-green-600 hover:bg-green-700">
              <Receipt className="h-4 w-4 mr-2" /> Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Curing Video Dialog */}
      <Dialog open={curingDialog} onOpenChange={setCuringDialog}>
        <DialogContent className="max-w-sm" data-testid="curing-video-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Video className="h-4 w-4 text-purple-600" /> Curing Video
            </DialogTitle>
            <DialogDescription>Select a project and mark curing status. Date is auto-captured.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Select Project *</Label>
              <Select value={curingProject} onValueChange={setCuringProject}>
                <SelectTrigger data-testid="curing-project-select">
                  <SelectValue placeholder="Choose project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Date & Time</Label>
              <div className="mt-1 px-3 py-2 bg-gray-100 rounded-md text-sm font-medium text-gray-700" data-testid="curing-datetime">
                {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} &mdash; {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Auto-captured (not editable)</p>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div>
                <Label className="text-sm font-medium text-purple-800">Curing Video Done</Label>
                <p className="text-[10px] text-purple-500">Toggle if curing video is completed</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={curingDone}
                data-testid="curing-done-toggle"
                onClick={() => setCuringDone(!curingDone)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${curingDone ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${curingDone ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {curingDone && curingProject && (
              <div className="p-2 bg-green-50 rounded-md border border-green-200 text-xs text-green-700 flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                WhatsApp message will open after saving
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCuringDialog(false)}>Cancel</Button>
            <Button onClick={handleCuringSubmit} className="bg-purple-600 hover:bg-purple-700" disabled={curingLoading} data-testid="curing-submit-btn">
              {curingLoading ? 'Saving...' : 'Save & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}


// ============ SITE VISITS SECTION ============
function SiteVisitsSection({ user }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jrEngineers, setJrEngineers] = useState([]);
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedJrId, setSelectedJrId] = useState('');

  useEffect(() => { fetchVisits(); fetchJrEngineers(); }, []);

  const fetchVisits = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/crm/my-site-visits`);
      setVisits(res.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchJrEngineers = async () => {
    try {
      const res = await axios.get(`${API}/crm/jr-engineers`);
      setJrEngineers(res.data || []);
    } catch { /* silent - may not have permission */ }
  };

  const handleAssignJr = async () => {
    if (!selectedJrId) { toast.error('Select a Jr. Engineer'); return; }
    try {
      await axios.post(`${API}/crm/leads/${selectedVisit.lead_id}/assign-jr-engineer?jr_engineer_id=${selectedJrId}`);
      toast.success('Jr. Engineer assigned');
      setAssignDialog(false);
      fetchVisits();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleMarkDone = async (leadId) => {
    if (!confirm('Mark this site visit as done?')) return;
    try {
      await axios.post(`${API}/crm/leads/${leadId}/complete-site-visit`);
      toast.success('Visit marked as done');
      fetchVisits();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const isSr = user?.role === 'sr_site_engineer' || user?.role === 'super_admin';
  const pendingVisits = visits.filter(v => v.visit_status !== 'completed');
  const completedVisits = visits.filter(v => v.visit_status === 'completed');

  if (loading) return <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-amber-600" /></div>;

  return (
    <div className="space-y-4">
      {visits.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Site Visits Assigned</h3>
            <p className="text-sm text-gray-600">You don't have any site visits assigned yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingVisits.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2"><Clock className="h-4 w-4" /> Pending Visits ({pendingVisits.length})</h3>
              <div className="space-y-3">
                {pendingVisits.map(v => (
                  <Card key={v.lead_id} className="border-l-4 border-l-amber-500" data-testid={`visit-card-${v.lead_id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-bold text-gray-900">{v.client_name}</h4>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={v.visit_type === 'client_land' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>{v.visit_type === 'client_land' ? 'Client Land' : 'Our Project'}</Badge>
                            {v.visit_date && <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{new Date(v.visit_date).toLocaleDateString('en-IN')}</Badge>}
                          </div>
                          {v.client_phone && <p className="text-sm text-gray-600">Phone: {v.client_phone}</p>}
                          {v.location && <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{v.location}</p>}
                          {v.project_name && <p className="text-sm text-gray-500">Project: {v.project_name}</p>}
                          {v.notes && <p className="text-sm text-gray-400 mt-1">{v.notes}</p>}

                          {/* Jr Engineer info */}
                          {v.jr_engineer_name && (
                            <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm">
                              <span className="font-medium text-blue-700">Assigned to Jr: {v.jr_engineer_name}</span>
                              {v.jr_engineer_phone && <span className="text-blue-600 ml-2">({v.jr_engineer_phone})</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {/* Sr. Engineer: Assign Jr. Engineer button */}
                          {isSr && !v.jr_engineer_id && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setSelectedVisit(v); setSelectedJrId(''); setAssignDialog(true); }} data-testid={`assign-jr-${v.lead_id}`}>
                              <Users className="h-4 w-4 mr-1" /> Assign Jr.
                            </Button>
                          )}
                          {/* Jr. Engineer: Mark Done button */}
                          {(v.assigned_to_me_as === 'jr' || (!v.jr_engineer_id && v.assigned_to_me_as === 'sr')) && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleMarkDone(v.lead_id)} data-testid={`mark-done-${v.lead_id}`}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Mark Done
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {completedVisits.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Completed ({completedVisits.length})</h3>
              <div className="space-y-2">
                {completedVisits.map(v => (
                  <Card key={v.lead_id} className="border-l-4 border-l-green-500 opacity-70" data-testid={`done-card-${v.lead_id}`}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-700">{v.client_name}</p>
                        <div className="flex gap-2 text-xs text-gray-500">
                          <span>{v.visit_type === 'client_land' ? 'Client Land' : 'Our Project'}</span>
                          {v.jr_engineer_name && <span>| Jr: {v.jr_engineer_name}</span>}
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-700">Done</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Assign Jr. Engineer Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Jr. Engineer</DialogTitle>
            <DialogDescription>Assign a Jr. Engineer for visit to {selectedVisit?.client_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium">{selectedVisit?.client_name}</p>
              <p className="text-gray-500">{selectedVisit?.visit_type === 'client_land' ? 'Client Land Visit' : 'Our Project Visit'}</p>
              {selectedVisit?.location && <p className="text-gray-500">{selectedVisit.location}</p>}
            </div>
            <div>
              <Label>Select Jr. Engineer *</Label>
              <Select value={selectedJrId} onValueChange={setSelectedJrId}>
                <SelectTrigger data-testid="select-jr-engineer"><SelectValue placeholder="Choose Jr. Engineer..." /></SelectTrigger>
                <SelectContent>
                  {jrEngineers.map(e => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.name} ({e.role?.replace(/_/g, ' ')}){e.phone ? ` - ${e.phone}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignJr} className="bg-blue-600 hover:bg-blue-700" data-testid="confirm-assign-jr">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
