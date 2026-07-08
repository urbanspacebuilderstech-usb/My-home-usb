import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  LogOut,
  HardHat,
  MapPin,
  Package,
  Users,
  ChevronRight,
  Clock,
  Menu,
  X,
  ClipboardList,
  IndianRupee,
  CheckCircle,
  Play,
  AlertCircle,
  Truck,
  Wallet,
  Plus,
  Receipt,
  Send,
  Video,
  MessageCircle,
  ArrowLeft
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
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Eye,
  Trash2,
  Pencil,
  Boxes,
  Ruler,
  Search
} from 'lucide-react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { AppHeader } from '../components/AppHeader';
import { StatusPill, pillState } from '../components/StatusPill';
import { CorrectionDialog } from '../components/CorrectionDialog';
import SrSERequestsTab from '../components/SrSERequestsTab';

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
  // Project search query — drives the Sr. SE / Super Admin table filter.
  // Matches against project name, client name, status (Phase), and the
  // formatted date string ("19 May 2026").
  const [projectSearch, setProjectSearch] = useState('');
  // Active phase filter chip from the KPI strip — empty string = no filter.
  const [phaseFilter, setPhaseFilter] = useState('');
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');
  
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  
  // Petty Cash states
  const [pettyCashList, setPettyCashList] = useState([]);
  const [correctionPC, setCorrectionPC] = useState(null);
  // Filter for the Petty Cash list — set by clicking the Pending Req / Waiting Approval tiles.
  // 'all' shows everything; 'pending' = requested (awaiting PM); 'waiting' = pm_approved/accountant_processing.
  const [pcStatusFilter, setPcStatusFilter] = useState('all');
  // Controlled sub-tab under the Petty Cash page so tile clicks can jump the
  // user to the correct list (Payment Req Status / Exp Waiting A/C etc.)
  const [pcSubTab, setPcSubTab] = useState('request_status');
  // Inside Payment Req Status: which stream to show — Req Petty Cash (petty_cash rows)
  // or Record Expense (direct_expenses items). Both share the same pcStatusFilter
  // (pending = Awaiting PM, waiting = Awaiting Accountant, all = everything).
  const [reqStatusSubTab, setReqStatusSubTab] = useState('petty_cash');
  const [pettyCashDialog, setPettyCashDialog] = useState(false);
  const [editingPettyCashId, setEditingPettyCashId] = useState(null);
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

  // Petty Cash Revamped states
  const [pettyCashSummary, setPettyCashSummary] = useState({});
  const [incomeHistory, setIncomeHistory] = useState([]);
  const [directExpensesList, setDirectExpensesList] = useState([]);
  const [directExpenseDialog, setDirectExpenseDialog] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  // Feb 28 2026 — Picked petty_cash bucket the SE wants to record this
  // expense against. Mandatory at submit (per user spec).
  const [linkedPettyCashId, setLinkedPettyCashId] = useState('');
  // Feb 28 2026 — Multi-select: SE can split an expense across multiple
  // issued petty-cash buckets. Each entry stores {petty_cash_id, amount}.
  const [linkedPettyCashSplits, setLinkedPettyCashSplits] = useState([]);
  const [directExpProject, setDirectExpProject] = useState('');
  const [directExpItems, setDirectExpItems] = useState([{category:'',expense_name:'',amount:'',bill_file_id:null,bill_filename:''}]);
  const [directExpLoading, setDirectExpLoading] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [newCategoryDialog, setNewCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [expenseFilterProject, setExpenseFilterProject] = useState('');
  const [expenseFilterFrom, setExpenseFilterFrom] = useState('');
  const [expenseFilterTo, setExpenseFilterTo] = useState('');

  // Petrol Allowance states
  const [petrolDialog, setPetrolDialog] = useState(false);
  const [petrolAmount, setPetrolAmount] = useState('');
  const [petrolKm, setPetrolKm] = useState('');
  const [petrolLoading, setPetrolLoading] = useState(false);
  const [petrolHistory, setPetrolHistory] = useState([]);

  // Material Request states
  const [matReqDialog, setMatReqDialog] = useState(false);
  const [matReqProject, setMatReqProject] = useState(null);
  const [matReqMaterials, setMatReqMaterials] = useState([]);
  const [matReqSelected, setMatReqSelected] = useState('');
  const [matReqQty, setMatReqQty] = useState('');
  const [matReqRemarks, setMatReqRemarks] = useState('');
  // Multi-line item entries — every request can include multiple materials.
  // Each row: { id, material_id, quantity, diameter, rod_count, remarks }
  const [matReqLines, setMatReqLines] = useState([]);
  const [matReqLoading, setMatReqLoading] = useState(false);
  const [matReqFetching, setMatReqFetching] = useState(false);

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

  // ============ PETTY CASH REVAMP FUNCTIONS ============
  const fetchPettyCashSummary = async () => {
    try {
      const res = await axios.get(`${API}/site-engineer/petty-cash/summary`);
      setPettyCashSummary(res.data || {});
    } catch { setPettyCashSummary({}); }
  };

  const fetchIncomeHistory = async () => {
    try {
      const res = await axios.get(`${API}/site-engineer/petty-cash/income-history`);
      setIncomeHistory(res.data || []);
    } catch { setIncomeHistory([]); }
  };

  const fetchDirectExpenses = async (proj, from, to) => {
    try {
      const params = new URLSearchParams();
      if (proj && proj !== 'all') params.append('project_id', proj);
      if (from) params.append('date_from', from);
      if (to) params.append('date_to', to);
      const res = await axios.get(`${API}/site-engineer/direct-expenses?${params.toString()}`);
      setDirectExpensesList(res.data || []);
    } catch { setDirectExpensesList([]); }
  };

  const fetchExpenseCategories = async () => {
    try {
      const res = await axios.get(`${API}/expense-categories`);
      setExpenseCategories(res.data || []);
    } catch { setExpenseCategories(['Electrical','Plumbing','Painting','Civil','Wooden','Miscellaneous']); }
  };

  const handleAcknowledgePettyCash = async (pcId) => {
    try {
      await axios.patch(`${API}/site-engineer/petty-cash/${pcId}/acknowledge`);
      toast.success('Petty cash acknowledged!');
      fetchData();
      fetchPettyCashSummary();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to acknowledge'); }
  };

  const handleDirectExpenseSubmit = async () => {
    if (!directExpProject) { toast.error('Select a project'); return; }
    if (linkedPettyCashSplits.length === 0 && !editingExpenseId) {
      toast.error('Pick at least one approved petty cash to record this expense against');
      return;
    }
    const validItems = directExpItems.filter(i => i.expense_name && i.amount);
    if (validItems.length === 0) { toast.error('Add at least one expense item'); return; }
    const totalAmount = validItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    // Feb 28 2026 — Auto-distribute the expense total across the picked
    // buckets FIFO (in the order checked). User no longer enters amounts
    // Feb 28 2026 — Bucket picking is mandatory. Without a bucket link, the
    // recorded_expense ends up with payment_mode='cash' by default, which
    // creates confusion downstream in the Accountant Approve dialog and
    // Cashbook. Force the SE to pick at least one petty cash bucket so the
    // Mode of Payment is always explicit (HDFC Current / Savings / etc.).
    let computedSplits = [];
    if (linkedPettyCashSplits.length === 0) {
      toast.error('Pick at least one Approved Petty Cash bucket before recording the expense.');
      return;
    }
    const totalAvailable = linkedPettyCashSplits.reduce((s, x) => s + (x.max || 0), 0);
    if (totalAmount > totalAvailable + 0.5) {
      toast.error(`Expense ₹${totalAmount.toLocaleString('en-IN')} exceeds picked balance ₹${totalAvailable.toLocaleString('en-IN')}. Pick more buckets.`);
      return;
    }
    let remaining = totalAmount;
    for (const s of linkedPettyCashSplits) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, s.max || 0);
      if (take > 0) {
        computedSplits.push({ petty_cash_id: s.petty_cash_id, amount: take });
        remaining -= take;
      }
    }
    setDirectExpLoading(true);
    try {
      await axios.post(`${API}/site-engineer/direct-expense`, {
        project_id: directExpProject,
        linked_petty_cash_splits: computedSplits,
        items: validItems.map(i => ({ category: i.category || 'Miscellaneous', expense_name: i.expense_name, amount: parseFloat(i.amount), bill_file_id: i.bill_file_id, bill_filename: i.bill_filename })),
      });
      if (editingExpenseId) {
        try { await axios.delete(`${API}/site-engineer/direct-expense/${editingExpenseId}`); } catch (_) { /* non-fatal */ }
        setEditingExpenseId(null);
      }
      toast.success(editingExpenseId ? 'Expense re-submitted!' : 'Expense recorded!');
      setDirectExpenseDialog(false);
      setLinkedPettyCashId('');
      setLinkedPettyCashSplits([]);
      fetchDirectExpenses(expenseFilterProject, expenseFilterFrom, expenseFilterTo);
      fetchPettyCashSummary();
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
    setDirectExpLoading(false);
  };

  // Feb 28 2026 — Delete own direct expense (SE can clean up pending or
  // PM/Accountant-rejected entries).
  const handleDeleteDirectExpense = async (de) => {
    if (!window.confirm(`Delete this expense of ₹${(de.total_amount || 0).toLocaleString('en-IN')}?\n\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/site-engineer/direct-expense/${de.expense_id}`);
      toast.success('Expense deleted');
      fetchDirectExpenses(expenseFilterProject, expenseFilterFrom, expenseFilterTo);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    }
  };

  // Feb 28 2026 — Edit a rejected expense: pre-fill the Record Expense
  // dialog with the rejected items so the SE can correct and re-submit.
  const handleEditDirectExpense = (de) => {
    setEditingExpenseId(de.expense_id);
    setDirectExpProject(de.project_id || '');
    setDirectExpItems((de.items || []).map(it => ({
      category: it.category || '',
      expense_name: it.expense_name || '',
      amount: String(it.amount || ''),
      bill_file_id: it.bill_file_id || null,
      bill_filename: it.bill_filename || '',
    })));
    setDirectExpenseDialog(true);
  };

  const handleBillUpload = async (idx, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'expense_bill');
    try {
      const res = await axios.post(`${API}/files/upload`, formData);
      const newItems = [...directExpItems];
      newItems[idx].bill_file_id = res.data.file_id;
      newItems[idx].bill_filename = res.data.filename;
      setDirectExpItems(newItems);
      toast.success('Bill uploaded');
    } catch { toast.error('Upload failed'); }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await axios.post(`${API}/expense-categories`, { name: newCategoryName.trim() });
      toast.success('Category created!');
      setNewCategoryName('');
      setNewCategoryDialog(false);
      fetchExpenseCategories();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create'); }
  };

  // Fetch summary & categories on mount
  useEffect(() => {
    fetchPettyCashSummary();
    fetchExpenseCategories();
  }, []);

  // ============ PETROL ALLOWANCE FUNCTIONS ============
  const fetchPetrolHistory = async () => {
    try {
      const res = await axios.get(`${API}/site-engineer/petrol-allowance/history`);
      setPetrolHistory(res.data || []);
    } catch { setPetrolHistory([]); }
  };

  const handlePetrolSubmit = async () => {
    if (!petrolAmount || !petrolKm) { toast.error('Enter amount and KM'); return; }
    setPetrolLoading(true);
    try {
      await axios.post(`${API}/site-engineer/petrol-allowance`, {
        amount: parseFloat(petrolAmount),
        km: parseFloat(petrolKm),
      });
      toast.success('Petrol allowance requested! Goes to Accountant.');
      setPetrolDialog(false);
      setPetrolAmount('');
      setPetrolKm('');
      fetchPetrolHistory();
      fetchPettyCashSummary();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setPetrolLoading(false);
  };

  // ============ MATERIAL REQUEST FUNCTIONS ============
  // Steel rod weight per piece (kg) — based on 40 ft (12m) standard rod and
  // ρ = (d² × L) / 162 where d=mm, L=metres. Lookup for common diameters,
  // falls back to formula for any other diameter the SE enters.
  const STEEL_ROD_WEIGHTS_40FT = {
    6: 2.71, 8: 4.82, 10: 7.53, 12: 10.83,
    16: 19.27, 20: 30.10, 25: 47.05, 32: 77.00,
  };
  const steelWeightPerRod = (diameterMm) => {
    const d = Number(diameterMm);
    if (!d || d <= 0) return 0;
    if (STEEL_ROD_WEIGHTS_40FT[d] != null) return STEEL_ROD_WEIGHTS_40FT[d];
    // d²/162 × 12 m = standard formula
    return Number(((d * d) / 162 * 12).toFixed(2));
  };

  // Detect a steel/TMT/rod material so we show the diameter + rod-count helper
  const isSteelMaterial = (mat) => {
    if (!mat) return false;
    const haystack = `${mat.name || ''} ${mat.brand || ''} ${mat.category || ''}`.toLowerCase();
    return /(steel|tmt|rebar|rod|reinforcement)/.test(haystack);
  };

  const blankMatLine = () => ({
    id: `ln_${Math.random().toString(36).slice(2, 9)}`,
    material_id: '',
    quantity: '',
    diameter: '',
    rod_count: '',
    remarks: '',
  });

  const addMatLine = () => setMatReqLines(prev => [...prev, blankMatLine()]);
  const removeMatLine = (id) => setMatReqLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  const updateMatLine = (id, patch) => {
    setMatReqLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      // Auto-calc quantity in kg for steel rods when diameter + rod_count are set
      const mat = matReqMaterials.find(m => m.material_id === next.material_id);
      if (mat && isSteelMaterial(mat) && next.diameter && next.rod_count) {
        const totalKg = Number((steelWeightPerRod(next.diameter) * Number(next.rod_count)).toFixed(2));
        if (!Number.isNaN(totalKg) && totalKg > 0) next.quantity = String(totalKg);
      }
      return next;
    }));
  };

  const openMatReqDialog = async (project) => {
    setMatReqProject(project);
    setMatReqSelected('');
    setMatReqQty('');
    setMatReqRemarks('');
    setMatReqLines([blankMatLine()]);
    setMatReqDialog(true);
    setMatReqFetching(true);
    try {
      const res = await axios.get(`${API}/projects/${project.project_id}/approved-materials`);
      setMatReqMaterials(res.data || []);
    } catch { setMatReqMaterials([]); toast.error('Could not load materials for this project'); }
    setMatReqFetching(false);
  };

  const handleMatReqSubmit = async () => {
    const validLines = matReqLines.filter(l => l.material_id && l.quantity && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) {
      toast.error('Add at least one material with quantity');
      return;
    }
    setMatReqLoading(true);
    try {
      let successCount = 0;
      for (const line of validLines) {
        const mat = matReqMaterials.find(m => m.material_id === line.material_id);
        if (!mat) continue;
        const isSteel = isSteelMaterial(mat);
        const lineRemarks = [
          line.remarks,
          isSteel && line.diameter ? `Ø ${line.diameter}mm × ${line.rod_count || 0} rods (≈ ${line.quantity} kg)` : null,
        ].filter(Boolean).join(' · ');
        await axios.post(`${API}/site-engineer/material-requests`, {
          project_id: matReqProject.project_id,
          material_id: mat.material_id,
          material_name: mat.name,
          brand: mat.brand || '',
          is_approved_material: true,
          quantity: parseFloat(line.quantity),
          unit: isSteel ? 'kg' : (mat.unit || 'unit'),
          remarks: lineRemarks || null,
        });
        successCount += 1;
      }
      toast.success(successCount > 1 ? `${successCount} materials requested!` : 'Material requested!');
      setMatReqDialog(false);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Request failed'); }
    setMatReqLoading(false);
  };
  
  // Petty Cash Functions
  const handleRequestPettyCash = async () => {
    if (!pettyCashForm.amount || !pettyCashForm.purpose) {
      toast.error('Please fill amount and purpose');
      return;
    }
    try {
      if (editingPettyCashId) {
        await axios.patch(`${API}/site-engineer/petty-cash/${editingPettyCashId}/resubmit`, {
          amount: parseFloat(pettyCashForm.amount),
          purpose: pettyCashForm.purpose,
          remarks: pettyCashForm.remarks,
        });
        toast.success('Petty cash resubmitted to PM!');
      } else {
        await axios.post(`${API}/site-engineer/petty-cash/request`, {
          amount: parseFloat(pettyCashForm.amount),
          purpose: pettyCashForm.purpose,
          remarks: pettyCashForm.remarks
        });
        toast.success('Petty cash requested! Goes to PM for approval.');
      }
      setPettyCashDialog(false);
      setEditingPettyCashId(null);
      setPettyCashForm({ project_id: '', amount: '', purpose: '', remarks: '' });
      fetchData(false);
      fetchPettyCashSummary();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  // Feb 28 2026 — Delete own petty cash request (only while pending or
  // PM-rejected; locked after accountant has touched it).
  const handleDeletePettyCashRequest = async (pc) => {
    if (!window.confirm(`Delete this petty cash request of ₹${(pc.amount_requested || pc.amount_issued || 0).toLocaleString('en-IN')}?\n\n${pc.purpose || ''}\n\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/site-engineer/petty-cash/${pc.petty_cash_id}`);
      toast.success('Petty cash request deleted');
      fetchData(false);
      fetchPettyCashSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    }
  };

  // Feb 28 2026 — Edit & resubmit a PM-rejected petty cash request.
  const handleEditPettyCashRequest = (pc) => {
    setEditingPettyCashId(pc.petty_cash_id);
    setPettyCashForm({
      project_id: pc.project_id || '',
      amount: String(pc.amount_requested || pc.amount_issued || ''),
      purpose: pc.purpose || '',
      remarks: pc.remarks || '',
    });
    setPettyCashDialog(true);
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

  // Background GPS tracking every 5 minutes when logged in — auto-logout if GPS off
  useEffect(() => {
    if (!currentlyLoggedProject) return;
    let gpsFailCount = 0;
    const trackLocation = async () => {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            () => reject(), { enableHighAccuracy: true, timeout: 10000 }
          );
        });
        gpsFailCount = 0; // Reset on success
        const res = await axios.post(`${API}/attendance/track-location`, pos);
        if (res.data.status === 'auto_logout') {
          toast.error(res.data.message);
          fetchData(false);
        }
      } catch {
        gpsFailCount++;
        if (gpsFailCount >= 2) {
          // GPS failed twice in a row — auto-logout
          try {
            await axios.post(`${API}/attendance/gps-lost-logout`);
            toast.error('GPS turned off — you have been automatically logged out from site attendance.');
            fetchData(false);
          } catch { /* ignore */ }
        } else {
          toast.warning('GPS signal lost. If GPS stays off, you will be auto-logged out.');
        }
      }
    };
    trackLocation(); // Track immediately
    const interval = setInterval(trackLocation, 5 * 60 * 1000); // Every 5 min
    return () => clearInterval(interval);
  }, [currentlyLoggedProject?.project_id]);

  const handleAttLogin = async () => {
    if (!attSelectedProject) { toast.error('Select a project site'); return; }
    setAttLoading(true);
    try {
      const gps = await getGPS();
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
      if (e?.response?.data?.detail) {
        toast.error(e.response.data.detail);
      } else {
        toast.error('GPS is required to login. Please enable Location/GPS on your device and try again.');
      }
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
      pm_approved: { label: 'PM Approved', className: 'bg-blue-100 text-blue-700' },
      pm_rejected: { label: 'PM Rejected', className: 'bg-red-100 text-red-700' },
      accountant_processing: { label: 'Processing', className: 'bg-purple-100 text-purple-700' },
      payment_done: { label: 'Payment Done', className: 'bg-teal-100 text-teal-700' },
      acknowledged: { label: 'Acknowledged', className: 'bg-green-100 text-green-700' },
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
    setPaymentAmount('');
    setPaymentRemarks('');
    setPaymentDialog(true);
  };

  const handleRequestPayment = async () => {
    if (!selectedStage) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await axios.patch(
        `${API}/projects/${selectedStage.workOrder.project_id}/work-orders/${selectedStage.workOrder.work_order_id}/stages/${selectedStage.stage.stage_id}/request-payment`,
        { amount, notes: paymentRemarks }
      );
      toast.success('Payment request submitted! Goes to PM → Planning → Accountant.');
      setPaymentDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request payment');
    }
  };

  const [finishStageDialog, setFinishStageDialog] = useState(false);
  const [finishStageTarget, setFinishStageTarget] = useState(null);
  const [finishStageRemarks, setFinishStageRemarks] = useState('');

  const handleFinishStage = async () => {
    if (!finishStageTarget) return;
    try {
      await axios.patch(
        `${API}/projects/${finishStageTarget.workOrder.project_id}/work-orders/${finishStageTarget.workOrder.work_order_id}/stages/${finishStageTarget.stage.stage_id}/finish`,
        { remarks: finishStageRemarks }
      );
      toast.success('Stage finished!');
      setFinishStageDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to finish stage');
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

  if (!user || (user.role !== 'site_engineer' && user.role !== 'sr_site_engineer')) {
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
      {/* Header — Dashboard only (per user request: no extra buttons/menus) */}
      <AppHeader user={user} />

      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6">
        {/* Header */}
        <div className="mb-3 sm:mb-4">
          <h2 data-testid="site-engineer-title" className="text-xl sm:text-3xl font-bold text-gray-900">My Projects</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Select a project to manage materials and labour</p>
        </div>

        {/* Top-level dashboard tabs — only My Projects, Petty Cash, Attendance.
            Site visits / Work orders / Cashbook / Curing video moved inside the project view. */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className={`grid ${user?.role === 'sr_site_engineer' || user?.role === 'super_admin' ? 'grid-cols-4' : 'grid-cols-3'} w-full h-auto bg-gray-100 p-1 rounded-lg`} data-testid="se-dashboard-tabs">
            <TabsTrigger
              value="projects"
              className="gap-2 text-base sm:text-lg font-semibold py-3 data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow"
              data-testid="tab-projects"
            >
              <Building2 className="h-5 w-5" /> My Projects
            </TabsTrigger>
            {(user?.role === 'sr_site_engineer' || user?.role === 'super_admin') && (
              <TabsTrigger
                value="requests"
                className="gap-2 text-base sm:text-lg font-semibold py-3 data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow"
                data-testid="tab-sr-se-requests"
              >
                <ClipboardList className="h-5 w-5" /> Requests
              </TabsTrigger>
            )}
            <TabsTrigger
              value="pettycash"
              className="gap-2 text-base sm:text-lg font-semibold py-3 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow"
              data-testid="tab-pettycash"
            >
              <Wallet className="h-5 w-5" /> Petty Cash
              {pettyCashList.filter(p => p.status === 'issued' || p.status === 'partially_spent').length > 0 && (
                <Badge className="h-5 min-w-[20px] px-1 flex items-center justify-center text-xs bg-emerald-500">
                  {pettyCashList.filter(p => p.status === 'issued' || p.status === 'partially_spent').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="attendance"
              className="gap-2 text-base sm:text-lg font-semibold py-3 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow"
              data-testid="tab-attendance"
            >
              <Clock className="h-5 w-5" /> Attendance
            </TabsTrigger>
          </TabsList>

          {/* Sr. SE — Read-only Requests tab (Material / Labour Payments / Petty Cash) */}
          {(user?.role === 'sr_site_engineer' || user?.role === 'super_admin') && (
            <TabsContent value="requests" className="mt-4">
              <SrSERequestsTab />
            </TabsContent>
          )}

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
            ) : (user?.role === 'sr_site_engineer' || user?.role === 'super_admin') ? (
              /* ===== Sr. Site Engineer / Super Admin — Planning-style table view =====
                 Compact Project | Client | Phase | Date | View table for
                 supervisors who need a quick scan across all assigned sites.
                 Regular site_engineer still gets the touch-friendly card list
                 below. Clicking a row opens the same default SE project page. */
              <div className="space-y-4" data-testid="sr-se-projects-block">
                {/* ── KPI strip ─────────────────────────────────────────────
                    Glance-able project mix counters (Total / In Planning /
                    In Construction / Completed / Others). Click any chip to
                    filter the table by that phase. Selected chip is hi-lit
                    with a deeper amber background; click again to clear.

                    Note (Feb 2026): we keep status strings in raw form
                    (`in_planning`, `in_construction`, `completed`) and only
                    humanise them in the badge — that way the click filter
                    stays consistent across renders.
                ──────────────────────────────────────────────────────────── */}
                {(() => {
                  const counts = projects.reduce((acc, p) => {
                    const k = (p.status || 'unknown').toLowerCase();
                    acc[k] = (acc[k] || 0) + 1;
                    acc.__total += 1;
                    return acc;
                  }, { __total: 0 });
                  const chips = [
                    { key: '__all', label: 'Total', count: counts.__total, cls: 'bg-gray-900 text-white' },
                    { key: 'in_planning', label: 'In Planning', count: counts['in_planning'] || 0, cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
                    { key: 'in_construction', label: 'In Construction', count: counts['in_construction'] || 0, cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
                    { key: 'completed', label: 'Completed', count: counts['completed'] || 0, cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
                  ];
                  return (
                    <div className="flex flex-wrap gap-2" data-testid="sr-se-kpi-strip">
                      {chips.map(c => {
                        const active = (c.key === '__all' && !phaseFilter) || phaseFilter === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setPhaseFilter(c.key === '__all' ? '' : (phaseFilter === c.key ? '' : c.key))}
                            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] ${c.cls} ${active ? 'ring-2 ring-offset-1 ring-amber-500' : 'opacity-90 hover:opacity-100'}`}
                            data-testid={`sr-se-kpi-${c.key}`}
                          >
                            <span>{c.label}</span>
                            <span className={`tabular-nums ${active ? 'font-bold' : 'font-semibold'}`}>{c.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Search + filtered-count display.
                    The little "Showing X of Y" text appears only when a
                    query or phase filter is active so the row stays clean
                    in the default state. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search project, client, phase or date…"
                      className="pl-9 h-9 text-sm bg-white border-amber-200 focus-visible:ring-amber-400"
                      data-testid="sr-se-projects-search"
                    />
                  </div>
                  {(projectSearch || phaseFilter) && (
                    <span className="text-xs text-gray-500 sm:ml-1" data-testid="sr-se-filter-count">
                      Showing <span className="font-semibold text-amber-700">{(() => {
                        const q = projectSearch.trim().toLowerCase();
                        return projects.filter(p => {
                          if (phaseFilter && (p.status || '').toLowerCase() !== phaseFilter) return false;
                          if (!q) return true;
                          const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                          return [p.name, p.client_name, (p.status || '').replace(/_/g, ' '), dateStr].filter(Boolean).join(' ').toLowerCase().includes(q);
                        }).length;
                      })()}</span> of {projects.length} projects
                    </span>
                  )}
                </div>

                <Card data-testid="sr-se-projects-table-card" className="overflow-hidden shadow-sm">
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="sr-se-projects-table">
                      <thead className="bg-gradient-to-r from-amber-50 to-amber-50/40 text-gray-700 border-b border-amber-100">
                        <tr>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Project</th>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Client</th>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Phase</th>
                          <th className="text-left font-semibold px-4 py-3 uppercase text-[11px] tracking-wider">Date</th>
                          <th className="text-right font-semibold px-4 py-3 uppercase text-[11px] tracking-wider w-20">View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const q = projectSearch.trim().toLowerCase();
                          const visible = projects.filter((p) => {
                            if (phaseFilter && (p.status || '').toLowerCase() !== phaseFilter) return false;
                            if (!q) return true;
                            const dateStr = p.created_at
                              ? new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '';
                            const blob = [
                              p.name,
                              p.client_name,
                              (p.status || '').replace(/_/g, ' '),
                              dateStr,
                            ].filter(Boolean).join(' ').toLowerCase();
                            return blob.includes(q);
                          });
                          if (visible.length === 0) {
                            return (
                              <tr>
                                <td colSpan={5} className="text-center text-gray-400 text-sm py-8" data-testid="sr-se-projects-empty">
                                  No projects match the current filter.
                                </td>
                              </tr>
                            );
                          }
                          // Pick a small palette of background tones for the
                          // initial-avatar so the eye can latch onto a project
                          // without reading the full name. Hash by project_id
                          // for stable colouring across renders.
                          const avatarPalette = [
                            'bg-amber-200 text-amber-800',
                            'bg-blue-200 text-blue-800',
                            'bg-emerald-200 text-emerald-800',
                            'bg-rose-200 text-rose-800',
                            'bg-violet-200 text-violet-800',
                            'bg-cyan-200 text-cyan-800',
                            'bg-orange-200 text-orange-800',
                          ];
                          const phaseTone = (s) => {
                            const k = (s || '').toLowerCase();
                            if (k === 'in_planning') return 'bg-amber-100 text-amber-800 border-amber-200';
                            if (k === 'in_construction') return 'bg-blue-100 text-blue-800 border-blue-200';
                            if (k === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                            if (k === 'on_hold' || k === 'cancelled') return 'bg-rose-100 text-rose-800 border-rose-200';
                            return 'bg-gray-100 text-gray-700 border-gray-200';
                          };
                          return visible.map((project, idx) => {
                            const dateStr = project.created_at
                              ? new Date(project.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—';
                            // Hash project_id → palette index (stable).
                            let h = 0;
                            for (const ch of (project.project_id || project.name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
                            const palette = avatarPalette[Math.abs(h) % avatarPalette.length];
                            const initials = (project.name || '?')
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map(w => w[0].toUpperCase())
                              .join('') || '?';
                            return (
                              <tr
                                key={project.project_id}
                                className={`group border-b last:border-b-0 cursor-pointer transition-all ${idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'} hover:bg-amber-50/70`}
                                onClick={() => window.location.href = `/site-engineer/project/${project.project_id}`}
                                data-testid={`project-row-${project.project_id}`}
                              >
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  <div className="flex items-center gap-3">
                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold tracking-wide ${palette} flex-shrink-0 shadow-sm`}>
                                      {initials}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate font-semibold">{project.name}</div>
                                      {project.location && (
                                        <div className="text-[11px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                                          <MapPin className="h-3 w-3" />
                                          {project.location}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-700">{project.client_name || '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={`text-[11px] font-medium ${phaseTone(project.status)}`}>
                                    {(project.status || 'unknown').replace(/_/g, ' ')}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{dateStr}</td>
                                <td className="px-4 py-3 text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100 group-hover:bg-amber-100 group-hover:translate-x-0.5 transition-all"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.location.href = `/site-engineer/project/${project.project_id}`;
                                    }}
                                    data-testid={`project-row-view-${project.project_id}`}
                                    title="Open project"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {projects.map((project) => (
                  <Card 
                    key={project.project_id} 
                    data-testid={`project-card-${project.project_id}`}
                    className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-amber-500 active:bg-gray-50"
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
                          <div className="mt-2 sm:mt-3 flex items-center gap-2 flex-wrap">
                            {project.active_orders > 0 && (
                              <div className="inline-flex items-center gap-1.5 bg-amber-100 px-2 py-1 rounded-lg">
                                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />
                                <span className="text-xs sm:text-sm font-medium text-amber-700">
                                  {project.active_orders} Active Orders
                                </span>
                              </div>
                            )}
                            {/* Request Material button removed (Feb 2026).
                                The Site Engineer must enter a project and use
                                the in-project "+ Request Order" (orange) flow
                                which now supports Steel auto-calc. */}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Work Orders Tab - Assigned Contractors View */}
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
            ) : !selectedContractor ? (
              /* ===== CONTRACTOR LIST VIEW ===== */
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-base font-semibold">Assigned Contractors</h3>
                </div>
                <p className="text-xs text-gray-400 mb-4">Tap a contractor to view their work order stages.</p>
                <div className="space-y-2">
                  {(() => {
                    const grouped = {};
                    workOrders.filter(wo => wo.order_type === 'labour').forEach(wo => {
                      const key = wo.contractor_name || wo.work_type || 'Unknown';
                      if (!grouped[key]) grouped[key] = { name: key, workType: wo.work_type || '', workOrders: [], totalAmount: 0, activeStages: 0, totalStages: 0 };
                      grouped[key].workOrders.push(wo);
                      grouped[key].totalAmount += wo.total_amount || 0;
                      (wo.stages || []).forEach(s => {
                        grouped[key].totalStages++;
                        if (s.stage_status !== 'finished' && s.status !== 'completed') grouped[key].activeStages++;
                      });
                    });
                    return Object.values(grouped).map(c => (
                      <Card key={c.name} className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-indigo-400" onClick={() => setSelectedContractor(c)} data-testid={`contractor-card-${c.name}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <Users className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-gray-900 truncate">{c.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.workType || 'Labour'}</Badge>
                              <span className="text-[10px] text-gray-500">{c.activeStages}/{c.totalStages} active</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-blue-600 whitespace-nowrap">{formatCurrency(c.totalAmount)}</span>
                          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        </CardContent>
                      </Card>
                    ));
                  })()}
                </div>
              </div>
            ) : (
              /* ===== CONTRACTOR STAGES DETAIL VIEW ===== */
              <div>
                <button className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 mb-3" onClick={() => setSelectedContractor(null)} data-testid="back-to-contractors">
                  <ArrowLeft className="h-4 w-4" /> Back to Contractors
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">{selectedContractor.name}</h3>
                    <p className="text-xs text-gray-500">{selectedContractor.workType} &bull; {selectedContractor.workOrders.length} Work Order(s) &bull; {formatCurrency(selectedContractor.totalAmount)}</p>
                  </div>
                </div>

                {selectedContractor.workOrders.map(wo => (
                  <Card key={wo.work_order_id} className="mb-3 border-l-4 border-l-indigo-400" data-testid={`wo-detail-${wo.work_order_id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{wo.work_order_number}</span>
                          <Badge variant="outline" className="text-[10px]">{wo.work_type || wo.order_type}</Badge>
                        </div>
                        <span className="text-sm font-bold text-green-600">{formatCurrency(wo.total_amount)}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mb-3">Project: {wo.project_name}</p>

                      {/* STAGES */}
                      {wo.stages && wo.stages.length > 0 && (
                        <div className="space-y-2">
                          {wo.stages.map((stage, idx) => {
                            const stageTotal = stage.amount || 0;
                            const released = (stage.payment_requests || []).filter(pr => pr.status === 'approved').reduce((s, pr) => s + (pr.approved_amount || 0), 0) || stage.amount_released || 0;
                            const pending = (stage.payment_requests || []).filter(pr => ['requested','pm_approved','planning_approved'].includes(pr.status)).reduce((s, pr) => s + (pr.amount || 0), 0) || 0;
                            const balance = stageTotal - released - pending;
                            const isFinished = stage.stage_status === 'finished' || stage.status === 'completed';
                            const prs = stage.payment_requests || [];

                            return (
                            <div key={idx} className={`rounded-lg p-3 border ${isFinished ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`} data-testid={`stage-card-${stage.stage_id}`}>
                              {/* Stage header */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">Stage {stage.stage_number}</span>
                                  <span className="text-sm font-medium">{stage.stage_name}</span>
                                  {isFinished && <Badge className="bg-green-100 text-green-700 text-[10px]">Finished</Badge>}
                                </div>
                                <span className="font-bold text-green-600 text-sm">{formatCurrency(stageTotal)}</span>
                              </div>

                              {/* Amount breakdown */}
                              <div className="grid grid-cols-3 gap-2 mb-2 text-[10px]">
                                <div className="bg-white p-1.5 rounded text-center border">
                                  <p className="text-gray-500 uppercase">Released</p>
                                  <p className="font-bold text-green-700">{formatCurrency(released)}</p>
                                </div>
                                <div className="bg-white p-1.5 rounded text-center border">
                                  <p className="text-gray-500 uppercase">Pending</p>
                                  <p className="font-bold text-amber-600">{formatCurrency(pending)}</p>
                                </div>
                                <div className="bg-white p-1.5 rounded text-center border">
                                  <p className="text-gray-500 uppercase">Balance</p>
                                  <p className="font-bold text-red-600">{formatCurrency(balance)}</p>
                                </div>
                              </div>

                              {/* Payment requests */}
                              {prs.length > 0 && (
                                <div className="mb-2 space-y-1">
                                  {prs.map((pr) => (
                                    <div key={pr.request_id} className="flex items-center justify-between bg-white px-2 py-1 rounded border text-[10px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium">{formatCurrency(pr.amount)}</span>
                                        <span className="text-gray-400">{new Date(pr.requested_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span>
                                      </div>
                                      <Badge className={`text-[9px] ${
                                        pr.status === 'approved' ? 'bg-green-100 text-green-700' :
                                        pr.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                        pr.status === 'planning_approved' ? 'bg-purple-100 text-purple-700' :
                                        pr.status === 'pm_approved' ? 'bg-blue-100 text-blue-700' :
                                        'bg-amber-100 text-amber-700'
                                      }`}>
                                        {pr.status === 'requested' ? 'Pending PM' : pr.status === 'pm_approved' ? 'Pending Planning' : pr.status === 'planning_approved' ? 'Pending Accountant' : pr.status === 'approved' ? 'Paid' : pr.status === 'rejected' ? 'Rejected' : pr.status}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Action buttons */}
                              {!isFinished && (
                                <div className="flex gap-2 flex-wrap">
                                  {balance > 0 && (
                                    <Button size="sm" onClick={() => openPaymentRequest(wo, stage)} className="gap-1 bg-orange-600 hover:bg-orange-700 h-7 text-xs" data-testid={`req-pay-${stage.stage_id}`}>
                                      <IndianRupee className="h-3 w-3" /> Request Payment
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => { setFinishStageTarget({ workOrder: wo, stage }); setFinishStageRemarks(''); setFinishStageDialog(true); }}
                                    className="gap-1 text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs" data-testid={`finish-stage-${stage.stage_id}`}>
                                    <CheckCircle className="h-3 w-3" /> Finish Stage
                                  </Button>
                                </div>
                              )}
                              {isFinished && stage.finished_remarks && (
                                <p className="text-[10px] text-green-600 mt-1">Remarks: {stage.finished_remarks}</p>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Petty Cash Tab */}
          <TabsContent value="pettycash" className="mt-4" data-testid="pettycash-tab">
            {/* Header with buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold">Petty Cash</h3>
              <div className="flex gap-2">
                <Button onClick={() => setPettyCashDialog(true)} className="gap-1.5 bg-green-600 hover:bg-green-700 h-8 text-xs" data-testid="req-petty-cash-btn">
                  <Plus className="h-3.5 w-3.5" /> Req Petty Cash
                </Button>
                <Button onClick={() => { setDirectExpenseDialog(true); setDirectExpItems([{category:'',expense_name:'',amount:'',bill_file_id:null,bill_filename:''}]); setDirectExpProject(''); }} variant="outline" className="gap-1.5 h-8 text-xs border-orange-300 text-orange-700 hover:bg-orange-50" data-testid="record-expense-btn">
                  <Receipt className="h-3.5 w-3.5" /> Record Expense
                </Button>
              </div>
            </div>
            
            {/* Segmented pill tabs — Cash in Hand | Expenses | Exp Waiting A/C | Pending Req | Waiting Approval */}
            {(() => {
              const balance = Math.max(0, (pettyCashSummary.total_cash_in_hand || 0) - (pettyCashSummary.total_expenses || 0) - (pettyCashSummary.expense_waiting_accountant_amount || 0));
              const pills = [
                { key: 'cash', label: 'Cash in Hand', value: `₹${balance.toLocaleString('en-IN')}`, tone: 'green', testId: 'pc-cash-in-hand', onClick: () => { setPcSubTab('income_history'); setPcStatusFilter('all'); fetchIncomeHistory(); } },
                { key: 'expenses', label: 'Expenses', value: `₹${(pettyCashSummary.total_expenses || 0).toLocaleString('en-IN')}`, tone: 'red', testId: 'pc-expenses', onClick: () => { setPcSubTab('expense_record'); setPcStatusFilter('all'); } },
                { key: 'exp_waiting', label: 'Exp Waiting A/C', value: `₹${(pettyCashSummary.expense_waiting_accountant_amount || 0).toLocaleString('en-IN')}`, sub: `${pettyCashSummary.expense_waiting_accountant || 0} entries`, tone: 'cyan', testId: 'pc-exp-waiting-tile', onClick: () => { setPcSubTab('exp_waiting'); setPcStatusFilter('all'); fetchDirectExpenses(); } },
                { key: 'pending', label: 'Pending Req', value: pettyCashSummary.pending_requests || 0, tone: 'amber', testId: 'pc-pending-tile', activeFilter: 'pending', onClick: () => { setPcSubTab('request_status'); setPcStatusFilter(f => f === 'pending' ? 'all' : 'pending'); fetchDirectExpenses(); } },
                { key: 'waiting', label: 'Waiting Approval', value: pettyCashSummary.waiting_approval || 0, tone: 'blue', testId: 'pc-waiting-tile', activeFilter: 'waiting', onClick: () => { setPcSubTab('request_status'); setPcStatusFilter(f => f === 'waiting' ? 'all' : 'waiting'); fetchDirectExpenses(); } },
              ];
              const toneMap = {
                green:  { base: 'bg-white text-green-700 border-green-200',    active: 'bg-green-600 text-white border-green-600',    hover: 'hover:border-green-400' },
                red:    { base: 'bg-white text-red-700 border-red-200',        active: 'bg-red-600 text-white border-red-600',        hover: 'hover:border-red-400' },
                cyan:   { base: 'bg-white text-cyan-700 border-cyan-200',      active: 'bg-cyan-600 text-white border-cyan-600',      hover: 'hover:border-cyan-400' },
                amber:  { base: 'bg-white text-amber-700 border-amber-200',    active: 'bg-amber-600 text-white border-amber-600',    hover: 'hover:border-amber-400' },
                blue:   { base: 'bg-white text-blue-700 border-blue-200',      active: 'bg-blue-600 text-white border-blue-600',      hover: 'hover:border-blue-400' },
              };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4" data-testid="pc-segmented-tiles">
                  {pills.map(p => {
                    const tones = toneMap[p.tone];
                    const isActive =
                      (p.activeFilter && pcStatusFilter === p.activeFilter && pcSubTab === 'request_status') ||
                      (p.key === 'exp_waiting' && pcSubTab === 'exp_waiting') ||
                      (p.key === 'expenses' && pcSubTab === 'expense_record') ||
                      (p.key === 'cash' && pcSubTab === 'income_history');
                    const clickable = !!p.onClick;
                    return (
                      <button
                        type="button"
                        key={p.key}
                        onClick={p.onClick || undefined}
                        disabled={!clickable}
                        className={`rounded-full border-2 px-3 py-2 text-center transition-all shadow-sm ${isActive ? tones.active + ' shadow-md scale-[1.02]' : tones.base + ' ' + tones.hover} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                        data-testid={p.testId}
                      >
                        <p className={`text-[10px] uppercase tracking-wide font-semibold ${isActive ? 'opacity-90' : 'opacity-80'}`}>{p.label}</p>
                        <p className={`text-base sm:text-lg font-bold leading-tight ${isActive ? 'text-white' : ''}`}>{p.value}</p>
                        {p.sub && <p className={`text-[10px] mt-0.5 ${isActive ? 'opacity-80' : 'opacity-70'}`}>{p.sub}</p>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Sub-tabs: Payment Req Status | Income History | Expense Record | Exp Waiting A/C | Petrol Allowance */}
            <Tabs value={pcSubTab} onValueChange={setPcSubTab} className="w-full">
              <TabsList className="flex w-full overflow-x-auto mb-3">
                <TabsTrigger value="request_status" className="flex-shrink-0 text-xs px-3">Payment Req Status</TabsTrigger>
                <TabsTrigger value="income_history" className="flex-shrink-0 text-xs px-3" onClick={() => fetchIncomeHistory()}>Income History</TabsTrigger>
                <TabsTrigger value="expense_record" className="flex-shrink-0 text-xs px-3" onClick={() => fetchDirectExpenses()}>Expense Record</TabsTrigger>
                <TabsTrigger value="exp_waiting" className="flex-shrink-0 text-xs px-3" data-testid="tab-exp-waiting" onClick={() => fetchDirectExpenses()}>Exp Waiting A/C</TabsTrigger>
                <TabsTrigger value="petrol_allowance" className="flex-shrink-0 text-xs px-3" data-testid="tab-petrol" onClick={() => fetchPetrolHistory()}>Petrol Allowance</TabsTrigger>
              </TabsList>

              {/* REQUEST STATUS — Req Petty Cash | Record Expense sub-tabs, both filtered by pcStatusFilter */}
              <TabsContent value="request_status">
                {(() => {
                  // Petty cash rows filtered by pending / waiting / all
                  const filteredPC = pettyCashList.filter(pc => {
                    if (pcStatusFilter === 'pending') return pc.status === 'requested';
                    if (pcStatusFilter === 'waiting') return ['pm_approved', 'accountant_processing'].includes(pc.status);
                    return true;
                  });
                  // Direct-expense items flattened + filtered by the same PM/Accountant stage
                  const flatExpenseItems = [];
                  (directExpensesList || []).forEach(de => {
                    (de.items || []).forEach(it => {
                      const s = (it.status || '').toLowerCase();
                      const stage = it.stage_label || (s === 'pm_approved' ? 'Awaiting Accountant' : 'Awaiting PM');
                      flatExpenseItems.push({
                        ...it, stage,
                        expense_id: de.expense_id,
                        direct_expense_id: de.expense_id,
                        project_name: de.project_name,
                        created_at: de.created_at,
                      });
                    });
                  });
                  const filteredExp = flatExpenseItems.filter(it => {
                    if (pcStatusFilter === 'pending') return it.stage === 'Awaiting PM';
                    if (pcStatusFilter === 'waiting') return it.stage === 'Awaiting Accountant';
                    return true;
                  });
                  const filterLabel = pcStatusFilter === 'pending'
                    ? 'Pending Req (Awaiting PM)'
                    : pcStatusFilter === 'waiting'
                    ? 'Waiting Approval (Accountant)'
                    : null;
                  return (
                    <>
                      {filterLabel && (
                        <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-xs text-slate-600">
                            Filtered to <span className="font-semibold text-slate-800">{filterLabel}</span>
                            {' — '}
                            <strong>{filteredPC.length}</strong> petty-cash · <strong>{filteredExp.length}</strong> expense{filteredExp.length === 1 ? '' : 's'}
                          </span>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600" onClick={() => setPcStatusFilter('all')} data-testid="clear-req-filter">Clear filter</Button>
                        </div>
                      )}

                      {/* Inner sub-tab pills: Req Petty Cash | Record Expense */}
                      <div className="flex items-center gap-1 mb-3 border-b" data-testid="req-status-subtabs">
                        {[
                          { key: 'petty_cash', label: 'Req Petty Cash', count: filteredPC.length, tone: 'text-green-700 border-green-600' },
                          { key: 'expense',    label: 'Record Expense', count: filteredExp.length, tone: 'text-orange-700 border-orange-600' },
                        ].map(t => {
                          const active = reqStatusSubTab === t.key;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setReqStatusSubTab(t.key)}
                              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                                active ? t.tone : 'border-transparent text-gray-500 hover:text-gray-700'
                              }`}
                              data-testid={`req-status-subtab-${t.key}`}
                            >
                              {t.label} <span className={`ml-1 inline-block px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {reqStatusSubTab === 'petty_cash' ? (
                        filteredPC.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <Wallet className="h-10 w-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">{pcStatusFilter === 'all' ? 'No petty cash requests' : 'Nothing matches this filter'}</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {filteredPC.map((pc) => (
                        <Card key={pc.petty_cash_id} className="border-l-4 border-l-green-500" data-testid={`pc-card-${pc.petty_cash_id}`}>
                          <CardContent className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <h4 className="font-semibold text-sm">{pc.purpose || 'Petty Cash'}</h4>
                                  <StatusPill
                                    status={pc.status}
                                    data-testid={`pc-status-${pc.petty_cash_id}`}
                                    onClick={['accountant_rejected','under_correction'].includes(pc.status) ? () => setCorrectionPC(pc) : undefined}
                                  />
                                </div>
                                {pc.project_name && pc.project_name !== 'General' && (
                                  <p className="text-xs text-gray-500">Project: {pc.project_name}</p>
                                )}
                                <p className="text-[10px] text-gray-400 mt-0.5">{new Date(pc.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-base font-bold text-green-600">₹{(pc.amount_issued || pc.amount_requested).toLocaleString('en-IN')}</p>
                                <div className="flex items-center justify-end gap-1 mt-1">
                                  {pc.status === 'pm_rejected' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                      onClick={() => handleEditPettyCashRequest(pc)}
                                      data-testid={`pc-edit-${pc.petty_cash_id}`}
                                      title="Edit and resubmit"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {!['issued','partially_spent','settled','payment_done','acknowledged','accountant_processing'].includes(pc.status) && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                                      onClick={() => handleDeletePettyCashRequest(pc)}
                                      data-testid={`pc-delete-${pc.petty_cash_id}`}
                                      title="Delete request"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Red banner — accountant rejection or post-approval correction */}
                            {['accountant_rejected','under_correction'].includes(pc.status) && (
                              <div className="mb-2 p-2 rounded bg-red-50 border-2 border-red-300 cursor-pointer hover:bg-red-100 transition" onClick={() => setCorrectionPC(pc)} data-testid={`pc-correction-banner-${pc.petty_cash_id}`}>
                                <p className="text-xs font-bold text-red-800">
                                  {pc.status === 'under_correction'
                                    ? '🔄 Approved entry sent back — Correction required'
                                    : '⚠ Rejected by Accountant — Re-enter Required'}
                                </p>
                                <p className="text-[11px] text-red-700 mt-0.5">
                                  <span className="font-semibold">Reason:</span> {pc.rejection_reason || pc.correction_reason || 'No reason given'}
                                </p>
                                <p className="text-[10px] text-red-600 mt-0.5 italic">
                                  Click to view details, edit, and resubmit for accountant approval.
                                </p>
                              </div>
                            )}
                            {/* Status timeline */}
                            <div className="flex items-center gap-1 text-[10px] mt-2 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded ${pc.status !== 'rejected' && pc.status !== 'pm_rejected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>Requested</span>
                              <span className="text-gray-300">→</span>
                              <span className={`px-1.5 py-0.5 rounded ${['pm_approved','accountant_processing','payment_done','acknowledged','issued','partially_spent','settled'].includes(pc.status) ? 'bg-green-100 text-green-700' : pc.status === 'pm_rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>PM {pc.status === 'pm_rejected' ? 'Rejected' : 'Approved'}</span>
                              <span className="text-gray-300">→</span>
                              <span className={`px-1.5 py-0.5 rounded ${['payment_done','acknowledged','issued','partially_spent','settled'].includes(pc.status) ? 'bg-green-100 text-green-700' : ['pm_approved'].includes(pc.status) ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>Accountant</span>
                              <span className="text-gray-300">→</span>
                              <span className={`px-1.5 py-0.5 rounded ${['acknowledged','settled'].includes(pc.status) ? 'bg-green-100 text-green-700' : pc.status === 'payment_done' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>Acknowledged</span>
                            </div>
                            {/* Action: Acknowledge */}
                            {pc.status === 'payment_done' && (
                              <div className="mt-2 p-2 bg-blue-50 rounded-md border border-blue-200">
                                <p className="text-xs text-blue-700 mb-1">Payment processed via {pc.payment_details?.payment_mode || 'N/A'} {pc.payment_details?.bank_name ? `(${pc.payment_details.bank_name})` : ''}</p>
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-7 text-xs" onClick={() => handleAcknowledgePettyCash(pc.petty_cash_id)} data-testid={`pc-acknowledge-${pc.petty_cash_id}`}>
                                  <CheckCircle className="h-3 w-3 mr-1" /> Acknowledge Receipt
                                </Button>
                              </div>
                            )}
                            {pc.status === 'pm_rejected' && pc.pm_rejected_reason && (
                              <p className="mt-1 text-xs text-red-500">Reason: {pc.pm_rejected_reason}</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                          )
                      ) : (
                        // RECORD EXPENSE sub-list — direct-expense items filtered by the same PM/Accountant stage
                        filteredExp.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">{pcStatusFilter === 'all' ? 'No recorded expenses' : 'Nothing matches this filter'}</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border rounded-lg" data-testid="req-status-expense-list">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Date</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Project</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Category</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Expense</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Amount</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Stage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredExp.map((row, idx) => {
                                  const isPM = row.stage === 'Awaiting PM';
                                  return (
                                    <tr key={`${row.direct_expense_id}-${row.item_id || idx}`} className="border-b hover:bg-gray-50" data-testid={`req-status-exp-row-${idx}`}>
                                      <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-700">{row.project_name || '—'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-700">{row.category || '—'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-800 font-medium">{row.expense_name || '—'}</td>
                                      <td className="px-3 py-2 text-xs text-right font-semibold text-orange-800">₹{Number(row.amount || 0).toLocaleString('en-IN')}</td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border ${
                                          isPM ? 'bg-amber-100 text-amber-800 border-amber-200'
                                               : row.stage === 'Awaiting Accountant' ? 'bg-cyan-100 text-cyan-800 border-cyan-200'
                                               : row.stage === 'Approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                               : 'bg-red-100 text-red-800 border-red-200'
                                        }`}>{row.stage}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </>
                  );
                })()}
              </TabsContent>

              {/* INCOME HISTORY */}
              <TabsContent value="income_history">
                {incomeHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-400"><IndianRupee className="h-10 w-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No income history yet</p></div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm" data-testid="income-history-table">
                      <thead><tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-center font-medium text-gray-600 text-xs w-12">S.No</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 text-xs whitespace-nowrap">Date</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 text-xs">Purpose</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">Req Amount</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">Exp Waiting</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">Spent</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">Balance</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 text-xs">Status</th>
                      </tr></thead>
                      <tbody>
                        {incomeHistory.map((r, idx) => {
                          const req = Number(r.amount_issued || 0);
                          const spent = Number(r.amount_spent || 0);
                          const expWaiting = Number(r.exp_waiting_amount || 0);
                          const balance = Math.max(0, req - spent - expWaiting);
                          return (
                            <tr key={r.petty_cash_id} className="border-b hover:bg-gray-50" data-testid={`income-row-${idx}`}>
                              <td className="px-3 py-2 text-xs text-center text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</td>
                              <td className="px-3 py-2 text-xs text-gray-700">{r.purpose}</td>
                              <td className="px-3 py-2 text-xs text-right font-semibold text-green-700">₹{req.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-xs text-right font-semibold text-cyan-700" data-testid={`income-row-exp-waiting-${idx}`}>₹{expWaiting.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-xs text-right text-red-600">₹{spent.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-xs text-right font-semibold text-blue-700">₹{balance.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-center">{getPettyCashStatusBadge(r.status)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* EXPENSE RECORD */}
              <TabsContent value="expense_record">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Select value={expenseFilterProject} onValueChange={(v) => { setExpenseFilterProject(v); fetchDirectExpenses(v, expenseFilterFrom, expenseFilterTo); }}>
                    <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <input type="date" className="h-8 text-xs border rounded px-2" value={expenseFilterFrom} onChange={e => { setExpenseFilterFrom(e.target.value); fetchDirectExpenses(expenseFilterProject, e.target.value, expenseFilterTo); }} placeholder="From" data-testid="exp-filter-from" />
                  <input type="date" className="h-8 text-xs border rounded px-2" value={expenseFilterTo} onChange={e => { setExpenseFilterTo(e.target.value); fetchDirectExpenses(expenseFilterProject, expenseFilterFrom, e.target.value); }} placeholder="To" data-testid="exp-filter-to" />
                </div>
                {directExpensesList.length === 0 ? (
                  <div className="text-center py-8 text-gray-400"><Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No expense records</p></div>
                ) : (
                  <div className="space-y-3">
                    {directExpensesList.map(de => (
                      <Card key={de.expense_id} className="border-l-4 border-l-red-400" data-testid={`dexp-card-${de.expense_id}`}>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm">{de.project_name}</h4>
                                {de.stage_label && (() => {
                                  const s = (de.overall_status || '').toLowerCase();
                                  const cls = s === 'approved' || s === 'verified' || s === 'recorded_into_cashbook'
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : s === 'pm_approved'
                                      ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
                                      : s === 'pm_rejected' || s === 'accountant_rejected' || s === 'rejected'
                                        ? 'bg-red-100 text-red-700 border-red-200'
                                        : 'bg-amber-100 text-amber-700 border-amber-200';
                                  return <Badge variant="outline" className={`text-[10px] ${cls}`} data-testid={`dexp-stage-${de.expense_id}`}>{de.stage_label}</Badge>;
                                })()}
                              </div>
                              <p className="text-[10px] text-gray-400">{new Date(de.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} {new Date(de.created_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <p className="text-base font-bold text-red-600">₹{de.total_amount?.toLocaleString('en-IN')}</p>
                              {(() => {
                                const s = (de.overall_status || '').toLowerCase();
                                const isRejected = s === 'pm_rejected' || s === 'accountant_rejected' || s === 'rejected';
                                const isLocked = s === 'approved' || s === 'verified' || s === 'recorded_into_cashbook' || s === 'accountant_approved';
                                return (
                                  <>
                                    {isRejected && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 ml-1"
                                        onClick={() => handleEditDirectExpense(de)}
                                        data-testid={`dexp-edit-${de.expense_id}`}
                                        title="Edit and resubmit"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {!isLocked && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                                        onClick={() => handleDeleteDirectExpense(de)}
                                        data-testid={`dexp-delete-${de.expense_id}`}
                                        title="Delete expense"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded p-2 space-y-1">
                            {de.items?.map((item, i) => (
                              <div key={i} className="flex justify-between text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{item.category}</Badge>
                                  <span className="text-gray-700">{item.expense_name}</span>
                                  {item.bill_filename && <span className="text-blue-500 text-[10px]">[bill]</span>}
                                  {item.stage_label && item.stage_label !== de.stage_label && (
                                    <span className="text-[9px] text-gray-500 italic">— {item.stage_label}</span>
                                  )}
                                </div>
                                <span className="font-medium">₹{item.amount?.toLocaleString('en-IN')}</span>
                              </div>
                            ))}
                            {(de.overall_status === 'pm_rejected' || de.overall_status === 'accountant_rejected' || de.overall_status === 'rejected') && (de.items || []).some(x => x.rejection_reason) && (
                              <div className="mt-1 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                                Reason: {(de.items || []).filter(x => x.rejection_reason)[0]?.rejection_reason}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* EXP WAITING A/C — direct-expense items whose worst stage is "Awaiting Accountant" */}
              <TabsContent value="exp_waiting" data-testid="exp-waiting-tab">
                {(() => {
                  const flat = [];
                  (directExpensesList || []).forEach(de => {
                    (de.items || []).forEach(it => {
                      if ((it.status || '').toLowerCase() === 'pm_approved' || it.stage_label === 'Awaiting Accountant') {
                        flat.push({ ...it, expense_id: de.expense_id, project_name: de.project_name, created_at: de.created_at });
                      }
                    });
                  });
                  const total = flat.reduce((s, r) => s + Number(r.amount || 0), 0);
                  return (
                    <>
                      <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-cyan-50 border border-cyan-200">
                        <span className="text-xs text-cyan-700">
                          Items you have recorded that are currently with the <strong>Accountant</strong> for final approval.
                        </span>
                        <span className="text-sm font-semibold text-cyan-800" data-testid="exp-waiting-total">
                          Total ₹{total.toLocaleString('en-IN')} · {flat.length} entries
                        </span>
                      </div>
                      {flat.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                          <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No expenses waiting with the Accountant.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="w-full text-sm" data-testid="exp-waiting-table">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Date</th>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Project</th>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Category</th>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Expense</th>
                                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Amount</th>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {flat.map((row, idx) => (
                                <tr key={`${row.expense_id}-${row.item_id || idx}`} className="border-b hover:bg-cyan-50/40" data-testid={`exp-waiting-row-${idx}`}>
                                  <td className="px-3 py-2 text-xs text-gray-700">{row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                                  <td className="px-3 py-2 text-xs text-gray-700">{row.project_name || '—'}</td>
                                  <td className="px-3 py-2 text-xs text-gray-700">{row.category || '—'}</td>
                                  <td className="px-3 py-2 text-xs text-gray-800 font-medium">{row.expense_name || '—'}</td>
                                  <td className="px-3 py-2 text-xs text-right font-semibold text-cyan-800">₹{Number(row.amount || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-2">
                                    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">Awaiting Accountant</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  );
                })()}
              </TabsContent>

              {/* PETROL ALLOWANCE */}
              <TabsContent value="petrol_allowance" data-testid="petrol-allowance-tab">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs text-gray-500">Petrol allowance requests go directly to Accountant.</p>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 text-xs" onClick={() => { setPetrolDialog(true); setPetrolAmount(''); setPetrolKm(''); }} data-testid="req-petrol-btn">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Request Petrol Allowance
                  </Button>
                </div>
                {petrolHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-400"><Truck className="h-10 w-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No petrol allowance requests yet</p></div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm" data-testid="petrol-history-table">
                      <thead><tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left font-medium text-gray-600 text-xs">Date</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">Amount</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">KM</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 text-xs">Status</th>
                      </tr></thead>
                      <tbody>
                        {petrolHistory.map(r => (
                          <tr key={r.allowance_id} className="border-b hover:bg-gray-50" data-testid={`petrol-row-${r.allowance_id}`}>
                            <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</td>
                            <td className="px-3 py-2 text-xs text-right font-semibold">₹{r.amount?.toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2 text-xs text-right">{r.km} km</td>
                            <td className="px-3 py-2 text-center">
                              <Badge className={`text-[10px] ${r.status === 'approved' ? 'bg-green-100 text-green-700' : r.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                                {r.status === 'requested' ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Rejected'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

            </Tabs>
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
            <DialogDescription>Select a project site to login. GPS must be ON.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
              <MapPin className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 font-medium">GPS/Location must be enabled on your device. Login will fail if GPS is off.</p>
            </div>
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
        <DialogContent data-testid="payment-request-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">Request Stage Payment</DialogTitle>
            <DialogDescription>Enter partial or full amount. Goes to PM → Planning → Accountant.</DialogDescription>
          </DialogHeader>
          
          {selectedStage && (() => {
            const st = selectedStage.stage;
            const released = (st.payment_requests || []).filter(pr => pr.status === 'approved').reduce((s, pr) => s + (pr.approved_amount || 0), 0) || st.amount_released || 0;
            const pending = (st.payment_requests || []).filter(pr => ['requested','pm_approved','planning_approved'].includes(pr.status)).reduce((s, pr) => s + (pr.amount || 0), 0) || 0;
            const balance = (st.amount || 0) - released - pending;
            return (
            <div className="space-y-3">
              <Card className="bg-gray-50"><CardContent className="p-3 text-xs space-y-1">
                <p><span className="text-gray-500">Work Order:</span> <span className="font-semibold">{selectedStage.workOrder.work_order_number} - {selectedStage.workOrder.work_type || selectedStage.workOrder.contractor_name}</span></p>
                <p><span className="text-gray-500">Stage:</span> <span className="font-semibold">{st.stage_name}</span></p>
                <div className="flex gap-3 mt-2 pt-2 border-t">
                  <div><span className="text-gray-500">Total:</span> <span className="font-bold text-green-700">{formatCurrency(st.amount)}</span></div>
                  <div><span className="text-gray-500">Released:</span> <span className="font-bold text-blue-600">{formatCurrency(released)}</span></div>
                  <div><span className="text-gray-500">Balance:</span> <span className="font-bold text-red-600">{formatCurrency(balance)}</span></div>
                </div>
              </CardContent></Card>
              
              <div>
                <Label className="text-xs font-medium">Request Amount *</Label>
                <NumericInput value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder={`Max: ₹${balance.toLocaleString('en-IN')}`} data-testid="payment-amount-input" />
                <p className="text-[10px] text-gray-400 mt-0.5">You can request partial amounts. Max available: ₹{balance.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <Label className="text-xs font-medium">Notes (Optional)</Label>
                <Textarea value={paymentRemarks} onChange={e => setPaymentRemarks(e.target.value)} placeholder="Work done summary, notes for PM..." rows={2} className="text-xs" />
              </div>
            </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestPayment} className="bg-orange-600 hover:bg-orange-700" data-testid="payment-submit-btn">
              <IndianRupee className="h-4 w-4 mr-1" /> Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finish Stage Dialog */}
      <Dialog open={finishStageDialog} onOpenChange={setFinishStageDialog}>
        <DialogContent className="max-w-sm" data-testid="finish-stage-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">Finish Stage</DialogTitle>
            <DialogDescription>Mark this stage as finished. No more payment requests will be allowed.</DialogDescription>
          </DialogHeader>
          {finishStageTarget && (
            <div className="space-y-3">
              <Card className="bg-green-50 border-green-200"><CardContent className="p-3 text-xs">
                <p className="font-semibold">{finishStageTarget.workOrder.work_order_number}</p>
                <p>Stage: <span className="font-semibold">{finishStageTarget.stage.stage_name}</span></p>
              </CardContent></Card>
              <div>
                <Label className="text-xs font-medium">Remarks *</Label>
                <Textarea value={finishStageRemarks} onChange={e => setFinishStageRemarks(e.target.value)} placeholder="Stage completion notes..." rows={2} className="text-xs" data-testid="finish-remarks" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishStageDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleFinishStage} data-testid="finish-stage-confirm">
              <CheckCircle className="h-4 w-4 mr-1" /> Finish Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petty Cash Request Dialog */}
      <Dialog open={pettyCashDialog} onOpenChange={(o) => { if (!o) { setEditingPettyCashId(null); } setPettyCashDialog(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPettyCashId ? 'Edit & Resubmit Petty Cash' : 'Request Petty Cash'}</DialogTitle>
            <DialogDescription>
              {editingPettyCashId ? 'Update the details and resubmit to PM for approval.' : 'Global petty cash request. Goes to PM for approval.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
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
            <Button variant="outline" onClick={() => { setPettyCashDialog(false); setEditingPettyCashId(null); }}>Cancel</Button>
            <Button onClick={handleRequestPettyCash} className="bg-green-600 hover:bg-green-700">
              <Wallet className="h-4 w-4 mr-2" /> {editingPettyCashId ? 'Resubmit' : 'Request'}
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

      {/* Record Expense Dialog */}
      <Dialog open={directExpenseDialog} onOpenChange={setDirectExpenseDialog}>
        <DialogContent className="max-w-lg" data-testid="record-expense-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4 text-orange-600" /> Record Expense</DialogTitle>
            <DialogDescription>Add expense line items directly — no approval needed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Feb 28 2026 — Multi-select picker for issued petty cash.
                SE can check 1+ buckets and split the expense across them. */}
            <div>
              <Label className="text-xs font-medium">Pick from Approved Petty Cash *</Label>
              {(() => {
                const MODE_LABEL = {
                  cash: 'Cash', hdfc_current: 'HDFC CURRENT', hdfc_savings: 'HDFC SAVINGS',
                  cheque: 'Cheque', direct_transfer: 'CASH D/T', escrow: 'Escrow',
                  current_account: 'HDFC CURRENT', savings_account: 'HDFC SAVINGS',
                };
                const fmtMode = (m) => MODE_LABEL[m] || (m ? m.replace(/_/g, ' ').toUpperCase() : '—');
                const available = (pettyCashList || []).filter(pc => {
                  const balance = (pc.amount_issued || 0) - (pc.amount_spent || 0);
                  // Include both freshly issued buckets AND partially_spent
                  // ones — after the SE records any expense, the bucket flips
                  // to partially_spent but still has remaining balance the SE
                  // can pick from for the next expense.
                  return (pc.status === 'issued' || pc.status === 'partially_spent') && balance > 0;
                });
                if (available.length === 0) {
                  return (
                    <div className="mt-1 p-3 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700">
                      No issued petty cash available. Ask the Accountant to issue petty cash to you first.
                    </div>
                  );
                }
                const toggle = (pc) => {
                  const exists = linkedPettyCashSplits.find(s => s.petty_cash_id === pc.petty_cash_id);
                  if (exists) {
                    setLinkedPettyCashSplits(linkedPettyCashSplits.filter(s => s.petty_cash_id !== pc.petty_cash_id));
                  } else {
                    const balance = (pc.amount_issued || 0) - (pc.amount_spent || 0);
                    // Feb 28 2026 — User asked to remove the manual "₹
                    // from this" input. The split amount is now computed
                    // FIFO on submit from the expense total. We just
                    // remember the picked bucket + its balance/mode here.
                    setLinkedPettyCashSplits([...linkedPettyCashSplits, { petty_cash_id: pc.petty_cash_id, max: balance, mode: pc.payment_mode || pc.mode || 'cash', purpose: pc.purpose || 'Petty Cash' }]);
                    if (pc.project_id && !directExpProject) setDirectExpProject(pc.project_id);
                  }
                };
                return (
                  <div className="mt-1 max-h-[180px] overflow-y-auto border rounded divide-y">
                    {available.map(pc => {
                      const balance = (pc.amount_issued || 0) - (pc.amount_spent || 0);
                      const split = linkedPettyCashSplits.find(s => s.petty_cash_id === pc.petty_cash_id);
                      const checked = !!split;
                      return (
                        <label key={pc.petty_cash_id} className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs ${checked ? 'bg-orange-50' : 'hover:bg-gray-50'}`} data-testid={`dexp-pc-row-${pc.petty_cash_id}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(pc)}
                            className="h-3.5 w-3.5"
                            data-testid={`dexp-pc-check-${pc.petty_cash_id}`}
                          />
                          <span className="flex-1 truncate">
                            {pc.purpose || 'Petty Cash'} · <span className="font-medium">{fmtMode(pc.payment_mode || pc.mode)}</span> · ₹{balance.toLocaleString('en-IN')}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
              {linkedPettyCashSplits.length > 0 && (
                <div className="text-[10px] text-gray-500 mt-1">
                  Picked {linkedPettyCashSplits.length} bucket{linkedPettyCashSplits.length > 1 ? 's' : ''} · Total available: <span className="font-semibold text-orange-700">₹{linkedPettyCashSplits.reduce((s, x) => s + (x.max || 0), 0).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-medium">Select Project *</Label>
              <Select value={directExpProject} onValueChange={setDirectExpProject}>
                <SelectTrigger data-testid="dexp-project-select"><SelectValue placeholder="Choose project..." /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">Expense Items</Label>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {directExpItems.map((item, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded-lg border space-y-2" data-testid={`dexp-item-${idx}`}>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select value={item.category} onValueChange={(v) => { const n = [...directExpItems]; n[idx].category = v; setDirectExpItems(n); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            <div className="p-1 border-t">
                              <Button size="sm" variant="ghost" className="w-full h-7 text-xs text-blue-600" onClick={(e) => { e.stopPropagation(); setNewCategoryDialog(true); }}>
                                <Plus className="h-3 w-3 mr-1" /> Create New
                              </Button>
                            </div>
                          </SelectContent>
                        </Select>
                      </div>
                      {directExpItems.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => setDirectExpItems(directExpItems.filter((_, i) => i !== idx))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Expense name" className="h-8 text-xs flex-1" value={item.expense_name} onChange={e => { const n = [...directExpItems]; n[idx].expense_name = e.target.value; setDirectExpItems(n); }} />
                      <Input placeholder="Amount" type="number" className="h-8 text-xs w-24" value={item.amount} onChange={e => { const n = [...directExpItems]; n[idx].amount = e.target.value; setDirectExpItems(n); }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => handleBillUpload(idx, e.target.files[0])} />
                        <Plus className="h-3 w-3" /> {item.bill_filename ? item.bill_filename : 'Upload Bill'}
                      </label>
                      {item.bill_filename && <Badge variant="outline" className="text-[10px] text-green-600">{item.bill_filename}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-xs" onClick={() => setDirectExpItems([...directExpItems, {category:'',expense_name:'',amount:'',bill_file_id:null,bill_filename:''}])} data-testid="dexp-add-item">
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            {/* Total */}
            <div className="flex justify-between items-center p-2 bg-orange-50 rounded-lg border border-orange-200">
              <span className="text-xs font-medium text-orange-700">Total</span>
              <span className="text-base font-bold text-orange-700" data-testid="dexp-total">₹{directExpItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDirectExpenseDialog(false); setEditingExpenseId(null); setLinkedPettyCashId(''); setLinkedPettyCashSplits([]); }}>Cancel</Button>
            <Button onClick={handleDirectExpenseSubmit} className="bg-orange-600 hover:bg-orange-700" disabled={directExpLoading} data-testid="dexp-submit-btn">
              {directExpLoading ? 'Saving...' : (editingExpenseId ? 'Resubmit Expense' : 'Record Expense')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Category Dialog */}
      <Dialog open={newCategoryDialog} onOpenChange={setNewCategoryDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Create New Category</DialogTitle>
          </DialogHeader>
          <Input placeholder="Category name" className="h-8 text-sm" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} data-testid="new-category-input" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewCategoryDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateCategory} data-testid="new-category-submit">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petrol Allowance Dialog */}
      <Dialog open={petrolDialog} onOpenChange={setPetrolDialog}>
        <DialogContent className="max-w-sm" data-testid="petrol-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-blue-600" /> Petrol Allowance</DialogTitle>
            <DialogDescription>Request petrol allowance. Goes directly to Accountant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Date</Label>
              <div className="mt-1 px-3 py-2 bg-gray-100 rounded-md text-sm font-medium text-gray-700" data-testid="petrol-date">
                {new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Auto-captured</p>
            </div>
            <div>
              <Label className="text-xs font-medium">Amount (₹) *</Label>
              <NumericInput value={petrolAmount} onChange={e => setPetrolAmount(e.target.value)} placeholder="Enter petrol amount" data-testid="petrol-amount" />
            </div>
            <div>
              <Label className="text-xs font-medium">Kilometers (KM) *</Label>
              <NumericInput value={petrolKm} onChange={e => setPetrolKm(e.target.value)} placeholder="Enter KM traveled" data-testid="petrol-km" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPetrolDialog(false)}>Cancel</Button>
            <Button onClick={handlePetrolSubmit} className="bg-blue-600 hover:bg-blue-700" disabled={petrolLoading} data-testid="petrol-submit">
              {petrolLoading ? 'Submitting...' : 'Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Request Dialog */}
      <Dialog open={matReqDialog} onOpenChange={setMatReqDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="material-request-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-blue-600" /> Request Material
            </DialogTitle>
            <DialogDescription>Request materials assigned by Planning for this project. Add multiple items to a single request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Project (auto-selected) */}
            <div>
              <Label className="text-xs">Project</Label>
              <div className="mt-1 px-3 py-2 bg-gray-100 rounded-md text-sm font-medium text-gray-700" data-testid="matreq-project-name">
                {matReqProject?.name || '—'}
              </div>
            </div>

            {/* Multi-line material entries */}
            {matReqFetching ? (
              <div className="text-xs text-gray-400 py-3 text-center">Loading materials...</div>
            ) : matReqMaterials.length === 0 ? (
              <div className="text-xs text-amber-600 py-2 bg-amber-50 rounded px-2 text-center">No materials added by Planning for this project yet.</div>
            ) : (
              <div className="space-y-2.5">
                {matReqLines.map((line, idx) => {
                  const mat = matReqMaterials.find(m => m.material_id === line.material_id);
                  const isSteel = mat && isSteelMaterial(mat);
                  const computedKg = isSteel && line.diameter && line.rod_count
                    ? Number((steelWeightPerRod(line.diameter) * Number(line.rod_count)).toFixed(2))
                    : 0;
                  return (
                    <div key={line.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm" data-testid={`matreq-line-${idx}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
                            <Boxes className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <span className="text-xs font-semibold text-gray-700">Item {idx + 1}</span>
                          {isSteel && (
                            <span className="text-[10px] uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">Steel</span>
                          )}
                        </div>
                        {matReqLines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:bg-red-50"
                            onClick={() => removeMatLine(line.id)}
                            data-testid={`matreq-remove-line-${idx}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      {/* Material selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-3">
                          <Label className="text-[11px] text-gray-500">Material <span className="text-red-500">*</span></Label>
                          <Select value={line.material_id} onValueChange={v => updateMatLine(line.id, { material_id: v })}>
                            <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`matreq-line-material-${idx}`}>
                              <SelectValue placeholder="Choose material..." />
                            </SelectTrigger>
                            <SelectContent>
                              {matReqMaterials.map(m => (
                                <SelectItem key={m.material_id} value={m.material_id}>
                                  {m.name} {m.brand ? `— ${m.brand}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Steel-specific helper: diameter + rod count → kg */}
                        {isSteel && (
                          <>
                            <div>
                              <Label className="text-[11px] text-gray-500 flex items-center gap-1">
                                <Ruler className="h-3 w-3" /> Diameter (mm) <span className="text-red-500">*</span>
                              </Label>
                              <Select value={String(line.diameter || '')} onValueChange={v => updateMatLine(line.id, { diameter: v })}>
                                <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`matreq-line-dia-${idx}`}>
                                  <SelectValue placeholder="Ø" />
                                </SelectTrigger>
                                <SelectContent>
                                  {[6, 8, 10, 12, 16, 20, 25, 32].map(d => (
                                    <SelectItem key={d} value={String(d)}>{d} mm</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[11px] text-gray-500">No. of Rods (40 ft) <span className="text-red-500">*</span></Label>
                              <NumericInput
                                value={line.rod_count}
                                onChange={e => updateMatLine(line.id, { rod_count: e.target.value })}
                                placeholder="e.g. 10"
                                className="mt-1 h-9 text-sm"
                                data-testid={`matreq-line-rods-${idx}`}
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-gray-500">Calculated Weight (kg)</Label>
                              <div className="mt-1 h-9 px-3 flex items-center bg-orange-50 border border-orange-200 rounded-md text-sm font-semibold text-orange-700" data-testid={`matreq-line-wt-${idx}`}>
                                {computedKg > 0 ? `${computedKg.toLocaleString('en-IN')} kg` : '—'}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Quantity row (always shown — auto-filled in kg for steel, manual entry for others) */}
                        {!isSteel && (
                          <>
                            <div className="sm:col-span-2">
                              <Label className="text-[11px] text-gray-500">Quantity Required <span className="text-red-500">*</span></Label>
                              <NumericInput
                                value={line.quantity}
                                onChange={e => updateMatLine(line.id, { quantity: e.target.value })}
                                placeholder="Enter quantity"
                                className="mt-1 h-9 text-sm"
                                data-testid={`matreq-line-qty-${idx}`}
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-gray-500">Unit</Label>
                              <div className="mt-1 h-9 px-3 flex items-center bg-gray-100 rounded-md text-sm text-gray-600">{mat?.unit || '—'}</div>
                            </div>
                          </>
                        )}

                        {/* Per-line remarks */}
                        <div className="sm:col-span-3">
                          <Label className="text-[11px] text-gray-500">Item Remarks (optional)</Label>
                          <Input
                            value={line.remarks}
                            onChange={e => updateMatLine(line.id, { remarks: e.target.value })}
                            placeholder="Any notes for this item..."
                            className="mt-1 h-9 text-sm"
                            data-testid={`matreq-line-remarks-${idx}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add Another Item */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 h-9"
                  onClick={addMatLine}
                  data-testid="matreq-add-item-btn"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Another Item
                </Button>
              </div>
            )}

            {/* 48 Hours Notice */}
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
              <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 font-medium">Minimum 48 hours required to receive materials after approval.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatReqDialog(false)}>Cancel</Button>
            <Button
              onClick={handleMatReqSubmit}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={matReqLoading || matReqMaterials.length === 0}
              data-testid="matreq-submit"
            >
              {matReqLoading ? 'Submitting...' : `Request ${matReqLines.filter(l => l.material_id && l.quantity).length > 0 ? `(${matReqLines.filter(l => l.material_id && l.quantity).length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction Engine — Petty Cash: handles accountant_rejected + under_correction */}
      <CorrectionDialog
        open={!!correctionPC}
        onClose={() => setCorrectionPC(null)}
        entityType="Petty Cash"
        doc={correctionPC}
        resubmitUrl={correctionPC ? `${API}/petty-cash/${correctionPC.petty_cash_id}/resubmit` : ''}
        editableFields={[
          { key: 'amount_requested', label: 'Amount Requested (₹)', type: 'number', required: true },
          { key: 'purpose', label: 'Purpose', type: 'text', full: true },
          { key: 'remarks', label: 'Remarks / Correction Notes', type: 'textarea', full: true },
        ]}
        canEdit={true}
        onAfterResubmit={async () => {
          try {
            const res = await axios.get(`${API}/site-engineer/petty-cash`);
            setPettyCashList(res.data || []);
          } catch (e) { /* noop */ }
        }}
      />

      <MobileBottomNav user={user} />
    </div>
  );
}
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

// ============ SITE VISITS SECTION ============
