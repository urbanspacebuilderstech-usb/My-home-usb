import { useState, useEffect, useCallback } from 'react';
import {
  Users, ChevronRight, ArrowLeft, ArrowRight, Send, Plus,
  Clock, CheckCircle, XCircle, AlertCircle, Wallet,
  ClipboardList, ChevronDown, ChevronUp, Banknote, Eye, Pencil, Lock, Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatCurrency(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
function formatDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; }
}

const STAGE_STATUS_CFG = {
  pending: { label: 'Active', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Clock },
  requested: { label: 'Payment Requested', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertCircle },
  procurement_approved: { label: 'Procurement OK', color: 'bg-purple-100 text-purple-800 border-purple-300', icon: CheckCircle },
  planning_approved: { label: 'Planning OK', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: CheckCircle },
  approved: { label: 'Closed', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
};

// Classify stages: completed stages before the first non-completed, active = first non-completed, upcoming = rest
function classifyStages(stages) {
  let foundActive = false;
  return stages.map((s, i) => {
    if (s.status === 'approved') return { ...s, _class: 'completed' };
    if (!foundActive) { foundActive = true; return { ...s, _class: 'active' }; }
    return { ...s, _class: 'upcoming' };
  });
}

export default function WorkOrderTab({ projectId, quickAttPopup, onQuickAttClose }) {
  const [contractors, setContractors] = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [expandedStage, setExpandedStage] = useState(null);
  const [stageAttendance, setStageAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('');

  // Labour Advance Request dialog (Planning → PM → GM → Accountant)
  const [advanceRequestDialog, setAdvanceRequestDialog] = useState({
    open: false, stage: null, workOrder: null, amount: '', date: '', reason: '',
  });
  const [advanceReqSaving, setAdvanceReqSaving] = useState(false);

  // Attendance popup
  const [attendancePopup, setAttendancePopup] = useState(null);
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [attRows, setAttRows] = useState([]);
  const [attSaving, setAttSaving] = useState(false);

  // Attendance detail popup
  const [attDetailPopup, setAttDetailPopup] = useState(null);

  // Payment popup
  const [paymentPopup, setPaymentPopup] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Add stage popup
  const [addStagePopup, setAddStagePopup] = useState(null);
  const [newStage, setNewStage] = useState({ stage_name: '', amount: '', start_date: '', end_date: '', notes: '', rates: [{ type: 'Skilled', rate: '' }, { type: 'Semi-Skilled', rate: '' }, { type: 'Unskilled', rate: '' }] });
  const [addingSaving, setAddingSaving] = useState(false);

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/projects/${projectId}/assigned-contractors`);
      setContractors(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchContractors(); }, [fetchContractors]);

  // Fetch current user role for permission-gated UI (Request Advance is Planning-only)
  useEffect(() => {
    (async () => {
      try {
        const me = await axios.get(`${API}/auth/me`);
        setCurrentUserRole(me.data?.role || '');
      } catch { setCurrentUserRole(''); }
    })();
  }, []);

  const submitAdvanceRequest = async () => {
    const { stage, workOrder, amount, date, reason } = advanceRequestDialog;
    if (!amount || Number(amount) <= 0) { toast.error('Amount must be > 0'); return; }
    if (!(reason || '').trim()) { toast.error('Reason is required'); return; }
    setAdvanceReqSaving(true);
    try {
      await axios.post(`${API}/labour-advance-requests`, {
        project_id: projectId,
        work_order_id: workOrder.work_order_id,
        stage_id: stage.stage_id,
        stage_name: stage.stage_name,
        contractor_id: workOrder.contractor_id || null,
        contractor_name: workOrder.contractor_name || '',
        amount: Number(amount),
        request_date: date || new Date().toISOString().split('T')[0],
        reason: reason.trim(),
      });
      toast.success('Advance request submitted — awaiting PM approval');
      setAdvanceRequestDialog({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit request');
    }
    setAdvanceReqSaving(false);
  };

  // Handle quick attendance trigger from parent
  useEffect(() => {
    if (quickAttPopup && contractors.length > 0) {
      // Auto-select first contractor with an active stage
      for (const c of contractors) {
        for (const wo of (c.work_orders || [])) {
          const stages = classifyStages(wo.payment_stages || []);
          const activeStage = stages.find(s => s._class === 'active');
          if (activeStage) {
            setSelectedContractor(c);
            openAttendancePopup(activeStage, wo);
            if (onQuickAttClose) onQuickAttClose();
            return;
          }
        }
      }
      toast.info('No active stages found for attendance');
      if (onQuickAttClose) onQuickAttClose();
    }
  }, [quickAttPopup, contractors]);

  const fetchStageAttendance = async (woId, stageId) => {
    try {
      const res = await axios.get(`${API}/labour-attendance?work_order_id=${woId}&stage_id=${stageId}`);
      setStageAttendance(prev => ({ ...prev, [`${woId}_${stageId}`]: res.data }));
    } catch (e) { console.error(e); }
  };

  const handleExpandStage = (wo, stage, cls) => {
    if (cls === 'upcoming') return;
    const key = `${wo.work_order_id}_${stage.stage_id}`;
    if (expandedStage === key) { setExpandedStage(null); return; }
    setExpandedStage(key);
    fetchStageAttendance(wo.work_order_id, stage.stage_id);
  };

  // Open attendance popup with labour_rates from stage
  const openAttendancePopup = (stage, workOrder) => {
    const rates = stage.labour_rates || [{ type: 'Skilled', rate: 0 }, { type: 'Semi-Skilled', rate: 0 }, { type: 'Unskilled', rate: 0 }];
    setAttRows(rates.map(r => ({ type: r.type, rate: r.rate, count: '' })));
    setAttDate(new Date().toISOString().split('T')[0]);
    setAttendancePopup({ stage, workOrder });
  };

  const attTotal = attRows.reduce((s, r) => s + (parseInt(r.count || 0) * (r.rate || 0)), 0);
  const attWorkers = attRows.reduce((s, r) => s + parseInt(r.count || 0), 0);

  const handleSubmitAttendance = async () => {
    if (attWorkers <= 0) { toast.error('Enter at least one worker count'); return; }
    setAttSaving(true);
    const { stage, workOrder } = attendancePopup;
    try {
      const entries = attRows.filter(r => parseInt(r.count || 0) > 0).map(r => ({
        type: r.type, label: r.type, count: parseInt(r.count), rate: r.rate, per_day_cost: r.rate, total: parseInt(r.count) * r.rate
      }));
      await axios.post(`${API}/labour-attendance`, {
        project_id: projectId,
        contractor_id: selectedContractor?.contractor_id || '',
        contractor_name: selectedContractor?.contractor_name || '',
        work_order_id: workOrder.work_order_id,
        stage_id: stage.stage_id,
        date: attDate,
        entries,
        notes: `${attWorkers} workers, Total: ${formatCurrency(attTotal)}`
      });
      toast.success(`Attendance recorded: ${attWorkers} workers, ${formatCurrency(attTotal)}`);
      setAttendancePopup(null);
      fetchContractors();
      fetchStageAttendance(workOrder.work_order_id, stage.stage_id);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    finally { setAttSaving(false); }
  };

  const handleRequestPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) { toast.error('Enter a valid amount'); return; }
    setPaymentSaving(true);
    const { stage, workOrder } = paymentPopup;
    try {
      await axios.patch(`${API}/labour-work-orders/${workOrder.work_order_id}/stages/${stage.stage_id}/request-payment`, {
        requested_amount: parseFloat(paymentAmount), notes: paymentNotes
      });
      toast.success('Payment requested! Goes to Procurement for approval.');
      setPaymentPopup(null); setPaymentAmount(''); setPaymentNotes('');
      fetchContractors();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setPaymentSaving(false); }
  };

  const handleAddStage = async () => {
    if (!newStage.stage_name) { toast.error('Enter stage name'); return; }
    setAddingSaving(true);
    const { workOrder } = addStagePopup;
    try {
      await axios.post(`${API}/labour-work-orders/${workOrder.work_order_id}/stages`, {
        stage_name: newStage.stage_name,
        amount: parseFloat(newStage.amount || 0),
        start_date: newStage.start_date,
        end_date: newStage.end_date,
        notes: newStage.notes,
        labour_rates: newStage.rates.filter(r => r.rate).map(r => ({ type: r.type, rate: parseFloat(r.rate) }))
      });
      toast.success('New stage added!');
      setAddStagePopup(null);
      setNewStage({ stage_name: '', amount: '', start_date: '', end_date: '', notes: '', rates: [{ type: 'Skilled', rate: '' }, { type: 'Semi-Skilled', rate: '' }, { type: 'Unskilled', rate: '' }] });
      fetchContractors();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setAddingSaving(false); }
  };

  // ===== CONTRACTOR LIST =====
  if (!selectedContractor) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600" /> Assigned Contractors
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Tap a contractor to view their work order stages</CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          {loading && contractors.length === 0 ? (
            <div className="text-center py-10 text-gray-400"><Clock className="h-8 w-8 mx-auto mb-2 animate-spin" /><p className="text-sm">Loading...</p></div>
          ) : contractors.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No contractors assigned yet</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="wo-contractor-list">
              {contractors.map(c => {
                const totalStages = c.work_orders?.reduce((s, wo) => s + (wo.payment_stages?.length || 0), 0) || 0;
                const activeStages = c.work_orders?.reduce((s, wo) => s + (wo.payment_stages?.filter(st => st.status !== 'approved').length || 0), 0) || 0;
                const totalAmount = c.work_orders?.reduce((s, wo) => s + (wo.total_amount || 0), 0) || 0;
                return (
                  <div key={c.contractor_id} className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all group"
                    onClick={() => setSelectedContractor(c)} data-testid={`wo-contractor-${c.contractor_id}`}>
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{c.contractor_name}</h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5">{c.contractor_type || 'General'}</Badge>
                        <span className="text-[10px] text-gray-400">{activeStages}/{totalStages} active</span>
                        <span className="text-[10px] font-medium text-blue-600">{formatCurrency(totalAmount)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ===== WORK ORDER DETAIL =====
  const workOrders = selectedContractor.work_orders || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedContractor(null); setExpandedStage(null); }} className="gap-1 text-xs" data-testid="wo-back-btn">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-bold truncate">{selectedContractor.contractor_name}</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{selectedContractor.contractor_type || 'General'}</Badge>
            {selectedContractor.phone && <span className="text-[10px] text-gray-500">{selectedContractor.phone}</span>}
          </div>
        </div>
      </div>

      {workOrders.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-gray-400">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No work orders</p>
        </CardContent></Card>
      ) : workOrders.map(wo => {
        const rawStages = wo.payment_stages || [];
        const stages = classifyStages(rawStages);
        return (
          <Card key={wo.work_order_id} data-testid={`wo-card-${wo.work_order_id}`}>
            <CardHeader className="p-3 sm:p-5 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm sm:text-base">{wo.description || 'Work Order'}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Total: {formatCurrency(wo.total_amount)} | Paid: {formatCurrency(wo.paid_amount)} |
                    <span className="font-medium text-orange-600 ml-1">Balance: {formatCurrency((wo.total_amount || 0) - (wo.paid_amount || 0))}</span>
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAddStagePopup({ workOrder: wo }); setNewStage({ stage_name: '', amount: '', start_date: '', end_date: '', notes: '', rates: [{ type: 'Skilled', rate: '' }, { type: 'Semi-Skilled', rate: '' }, { type: 'Unskilled', rate: '' }] }); }} data-testid={`add-stage-${wo.work_order_id}`}>
                  <Plus className="h-3 w-3" /> Stage
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-5 pt-0">
              {stages.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">No stages defined</p>
              ) : (
                <div className="relative pl-6 mt-2" data-testid="stage-timeline">
                  <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200"></div>
                  <div className="space-y-3">
                    {stages.map((stage) => {
                      const cls = stage._class;
                      const stageKey = `${wo.work_order_id}_${stage.stage_id}`;
                      const expanded = expandedStage === stageKey;
                      const records = stageAttendance[stageKey] || [];
                      const statusCfg = STAGE_STATUS_CFG[stage.status] || STAGE_STATUS_CFG.pending;
                      const StatusIcon = statusCfg.icon;
                      const spendPct = stage.amount > 0 ? Math.min(100, Math.round((stage.total_spend || 0) / stage.amount * 100)) : 0;

                      // UPCOMING: only name + expected start date
                      if (cls === 'upcoming') {
                        return (
                          <div key={stage.stage_id} className="relative opacity-40" data-testid={`stage-${stage.stage_id}`}>
                            <div className="absolute -left-6 mt-1 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 bg-gray-100 border-gray-300">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </div>
                            <div className="border rounded-lg border-gray-200 bg-gray-50 p-3 flex items-center justify-between">
                              <div>
                                <h4 className="text-sm font-medium text-gray-600">{stage.stage_name}</h4>
                                {stage.start_date && <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" />Expected: {formatDate(stage.start_date)}</p>}
                              </div>
                              <Badge variant="outline" className="text-[9px] border-gray-300 text-gray-400">Upcoming</Badge>
                            </div>
                          </div>
                        );
                      }

                      // COMPLETED: can open and view
                      if (cls === 'completed') {
                        return (
                          <div key={stage.stage_id} className="relative" data-testid={`stage-${stage.stage_id}`}>
                            <div className="absolute -left-6 mt-1 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 bg-green-50 border-green-400">
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            </div>
                            <div className="border rounded-lg border-green-200 bg-green-50/30 overflow-hidden">
                              <div className="p-3 cursor-pointer hover:bg-green-50 flex items-center justify-between" onClick={() => handleExpandStage(wo, stage, cls)}>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-700">{stage.stage_name}</h4>
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.color}`}>{statusCfg.label}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                    <span className="font-medium text-gray-700">{formatCurrency(stage.amount)}</span>
                                    <span>Paid: {formatCurrency(stage.approved_amount || stage.amount)}</span>
                                    {stage.start_date && <span>{formatDate(stage.start_date)} → {formatDate(stage.end_date)}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Eye className="h-4 w-4 text-gray-400" />
                                  {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </div>
                              </div>
                              {expanded && (
                                <div className="border-t p-3 space-y-3 bg-white/80">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div><span className="text-gray-500">Amount</span><p className="font-semibold">{formatCurrency(stage.amount)}</p></div>
                                    <div><span className="text-gray-500">Spent</span><p className="font-semibold">{formatCurrency(stage.total_spend || 0)}</p></div>
                                    <div><span className="text-gray-500">Days Worked</span><p className="font-semibold">{stage.total_attendance_days || 0}</p></div>
                                    <div><span className="text-gray-500">Paid</span><p className="font-semibold text-green-700">{formatCurrency(stage.approved_amount || stage.amount)}</p></div>
                                  </div>
                                  {records.length > 0 && <AttendanceTable records={records} onClickRecord={setAttDetailPopup} />}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // ACTIVE: full details, expandable, editable, attendance
                      return (
                        <div key={stage.stage_id} className="relative" data-testid={`stage-${stage.stage_id}`}>
                          <div className="absolute -left-6 mt-1 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 bg-white border-blue-500 ring-2 ring-blue-100">
                            <StatusIcon className="h-3 w-3 text-blue-600" />
                          </div>
                          <div className="border-2 rounded-lg border-blue-300 bg-white overflow-hidden shadow-sm">
                            <div className="p-3 cursor-pointer hover:bg-blue-50/30" onClick={() => handleExpandStage(wo, stage, cls)}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-bold text-gray-900">{stage.stage_name}</h4>
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.color}`}>{statusCfg.label}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                    <span className="font-semibold text-gray-800">{formatCurrency(stage.amount)}</span>
                                    {stage.start_date && <span>{formatDate(stage.start_date)} → {formatDate(stage.end_date)}</span>}
                                  </div>
                                  {(stage.total_spend > 0 || stage.total_attendance_days > 0) && (
                                    <div className="mt-2">
                                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                                        <span className="text-gray-500">{stage.total_attendance_days || 0} days | Spent: {formatCurrency(stage.total_spend || 0)}</span>
                                        <span className="font-medium">{spendPct}%</span>
                                      </div>
                                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${spendPct > 80 ? 'bg-red-500' : spendPct > 50 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${spendPct}%` }}></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 mt-1" />}
                              </div>
                            </div>
                            {expanded && (
                              <div className="border-t p-3 space-y-3 bg-gray-50/50">
                                {/* Labour Rates */}
                                {stage.labour_rates && stage.labour_rates.length > 0 && (
                                  <div className="flex gap-2 flex-wrap text-[10px]">
                                    {stage.labour_rates.map(r => (
                                      <span key={r.type} className="px-2 py-1 bg-blue-50 border border-blue-200 rounded text-blue-700">
                                        {r.type}: {formatCurrency(r.rate)}/day
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Actions */}
                                <div className="flex gap-2 flex-wrap">
                                  {/* Planning: Request Advance (Planning → PM → GM → Accountant) */}
                                  {currentUserRole === 'planning' || currentUserRole === 'super_admin' ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAdvanceRequestDialog({
                                          open: true,
                                          stage,
                                          workOrder: wo,
                                          amount: stage.amount ? String(stage.amount) : '',
                                          date: new Date().toISOString().split('T')[0],
                                          reason: '',
                                        });
                                      }}
                                      data-testid={`req-advance-${stage.stage_id}`}
                                    >
                                      <ArrowRight className="h-3 w-3" /> Request Advance
                                    </Button>
                                  ) : null}
                                  {stage.status === 'pending' && (
                                    <>
                                      <Button size="sm" className="gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                        onClick={(e) => { e.stopPropagation(); openAttendancePopup(stage, wo); }} data-testid={`add-attendance-${stage.stage_id}`}>
                                        <ClipboardList className="h-3 w-3" /> Daily Attendance
                                      </Button>
                                      <Button size="sm" variant="outline" className="gap-1 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                                        onClick={(e) => { e.stopPropagation(); setPaymentAmount(''); setPaymentNotes(''); setPaymentPopup({ stage, workOrder: wo }); }} data-testid={`req-payment-${stage.stage_id}`}>
                                        <Banknote className="h-3 w-3" /> Req Payment
                                      </Button>
                                    </>
                                  )}
                                  {stage.status === 'requested' && (
                                    <>
                                      <Button size="sm" className="gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                        onClick={(e) => { e.stopPropagation(); openAttendancePopup(stage, wo); }} data-testid={`add-attendance-${stage.stage_id}`}>
                                        <ClipboardList className="h-3 w-3" /> Daily Attendance
                                      </Button>
                                      <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded border border-amber-200 flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" /> {formatCurrency(stage.requested_amount)} requested — awaiting approval
                                      </div>
                                    </>
                                  )}
                                  {stage.status === 'procurement_approved' && (
                                    <div className="text-xs text-purple-700 bg-purple-50 px-2 py-1.5 rounded border border-purple-200 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Procurement OK — awaiting Planning
                                    </div>
                                  )}
                                  {stage.status === 'planning_approved' && (
                                    <div className="text-xs text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded border border-indigo-200 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Planning OK — awaiting Accountant
                                    </div>
                                  )}
                                </div>
                                {/* Attendance Log */}
                                {records.length > 0 ? (
                                  <AttendanceTable records={records} onClickRecord={setAttDetailPopup} />
                                ) : (
                                  <p className="text-xs text-gray-400 text-center py-2">No attendance records yet</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* ===== DAILY ATTENDANCE POPUP (multi-row) ===== */}
      <Dialog open={!!attendancePopup} onOpenChange={(v) => { if (!v) setAttendancePopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg" data-testid="attendance-popup">
          <DialogHeader>
            <DialogTitle className="text-base">Daily Attendance</DialogTitle>
            <DialogDescription className="text-xs">{attendancePopup?.stage?.stage_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="text-sm mt-1" data-testid="att-date" />
            </div>
            {/* Employee type rows */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Count</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Rate/Day</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attRows.map((row, i) => (
                    <tr key={row.type} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{row.type}</td>
                      <td className="px-3 py-2">
                        <Input type="number" min="0" placeholder="0" value={row.count}
                          onChange={(e) => { const nrows = [...attRows]; nrows[i].count = e.target.value; setAttRows(nrows); }}
                          className="h-8 text-center text-sm w-20 mx-auto" data-testid={`att-count-${row.type}`} />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(row.rate)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(parseInt(row.count || 0) * row.rate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                  <tr>
                    <td className="px-3 py-2 font-bold text-blue-800">Total</td>
                    <td className="px-3 py-2 text-center font-bold text-blue-800" data-testid="att-total-workers">{attWorkers}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-bold text-blue-800 text-sm" data-testid="att-total-cost">{formatCurrency(attTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAttendancePopup(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSubmitAttendance} disabled={attSaving} className="gap-1" data-testid="submit-att-btn">
              <Send className="h-3 w-3" /> {attSaving ? 'Saving...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== ATTENDANCE DETAIL POPUP ===== */}
      <Dialog open={!!attDetailPopup} onOpenChange={(v) => { if (!v) setAttDetailPopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Attendance Detail</DialogTitle>
            <DialogDescription className="text-xs">{formatDate(attDetailPopup?.date)}</DialogDescription>
          </DialogHeader>
          {attDetailPopup && (
            <div className="space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-center px-3 py-2">Workers</th>
                      <th className="text-right px-3 py-2">Rate</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(attDetailPopup.entries || []).map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium">{e.type || e.label}</td>
                        <td className="px-3 py-2 text-center">{e.count}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(e.rate || e.per_day_cost)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                    <tr>
                      <td className="px-3 py-2 font-bold text-blue-800">Total</td>
                      <td className="px-3 py-2 text-center font-bold text-blue-800">{attDetailPopup.total_workers}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-bold text-blue-800">{formatCurrency(attDetailPopup.total_cost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {attDetailPopup.notes && <p className="text-xs text-gray-500">{attDetailPopup.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== LABOUR ADVANCE REQUEST DIALOG (Planning → PM → GM → Accountant) ===== */}
      <Dialog open={advanceRequestDialog.open} onOpenChange={(v) => { if (!v) setAdvanceRequestDialog({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' }); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="labour-advance-popup">
          <DialogHeader>
            <DialogTitle className="text-base">Request Labour Advance</DialogTitle>
            <DialogDescription className="text-xs">
              {advanceRequestDialog.stage?.stage_name} · {advanceRequestDialog.workOrder?.contractor_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border bg-emerald-50/40 px-3 py-2 text-[11px] text-emerald-800">
              Flow: <span className="font-semibold">Planning</span> → PM → GM → Accountant. Once fully approved, this advance becomes a Payment Schedule entry under the project.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount (₹) <span className="text-red-500">*</span></Label>
                <Input type="number" min="1" value={advanceRequestDialog.amount} onChange={(e) => setAdvanceRequestDialog((s) => ({ ...s, amount: e.target.value }))} className="text-sm mt-1 font-semibold" data-testid="advance-amount" />
              </div>
              <div>
                <Label className="text-xs">Request Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={advanceRequestDialog.date} onChange={(e) => setAdvanceRequestDialog((s) => ({ ...s, date: e.target.value }))} className="text-sm mt-1" data-testid="advance-date" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Reason / Description <span className="text-red-500">*</span></Label>
              <Textarea rows={3} placeholder="Why is this advance needed?" value={advanceRequestDialog.reason} onChange={(e) => setAdvanceRequestDialog((s) => ({ ...s, reason: e.target.value }))} className="text-sm mt-1" data-testid="advance-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAdvanceRequestDialog({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' })}>Cancel</Button>
            <Button size="sm" onClick={submitAdvanceRequest} disabled={advanceReqSaving} className="gap-1 bg-emerald-600 hover:bg-emerald-700" data-testid="submit-advance-btn">
              <Send className="h-3 w-3" /> {advanceReqSaving ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* ===== REQUEST PAYMENT POPUP ===== */}
      <Dialog open={!!paymentPopup} onOpenChange={(v) => { if (!v) setPaymentPopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="payment-popup">
          <DialogHeader>
            <DialogTitle className="text-base">Request Payment</DialogTitle>
            <DialogDescription className="text-xs">{paymentPopup?.stage?.stage_name} — Stage: {formatCurrency(paymentPopup?.stage?.amount)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 border rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">Stage Amount</span><p className="font-semibold">{formatCurrency(paymentPopup?.stage?.amount)}</p></div>
              <div><span className="text-gray-500">Total Spend</span><p className="font-semibold">{formatCurrency(paymentPopup?.stage?.total_spend || 0)}</p></div>
              <div><span className="text-gray-500">Days Worked</span><p className="font-semibold">{paymentPopup?.stage?.total_attendance_days || 0}</p></div>
              <div><span className="text-gray-500">Balance</span><p className="font-semibold text-orange-600">{formatCurrency((paymentPopup?.stage?.amount || 0) - (paymentPopup?.stage?.total_spend || 0))}</p></div>
            </div>
            <div>
              <Label className="text-xs">Request Amount</Label>
              <Input type="number" min="1" placeholder="Enter amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="text-sm mt-1 text-lg font-semibold" data-testid="payment-amount" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Reason..." value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} rows={2} className="text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPaymentPopup(null)}>Cancel</Button>
            <Button size="sm" onClick={handleRequestPayment} disabled={paymentSaving} className="gap-1 bg-orange-600 hover:bg-orange-700" data-testid="submit-payment-btn">
              <Wallet className="h-3 w-3" /> {paymentSaving ? 'Requesting...' : 'Request Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== ADD NEW STAGE POPUP ===== */}
      <Dialog open={!!addStagePopup} onOpenChange={(v) => { if (!v) setAddStagePopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg" data-testid="add-stage-popup">
          <DialogHeader>
            <DialogTitle className="text-base">Add New Stage</DialogTitle>
            <DialogDescription className="text-xs">Add a stage to this work order</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Stage Name *</Label>
              <Input placeholder="e.g. Plastering" value={newStage.stage_name} onChange={(e) => setNewStage({ ...newStage, stage_name: e.target.value })} className="text-sm mt-1" data-testid="new-stage-name" />
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" placeholder="Stage amount" value={newStage.amount} onChange={(e) => setNewStage({ ...newStage, amount: e.target.value })} className="text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={newStage.start_date} onChange={(e) => setNewStage({ ...newStage, start_date: e.target.value })} className="text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={newStage.end_date} onChange={(e) => setNewStage({ ...newStage, end_date: e.target.value })} className="text-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Labour Rates (per day)</Label>
              <div className="space-y-2">
                {newStage.rates.map((r, i) => (
                  <div key={r.type} className="flex items-center gap-2">
                    <span className="text-xs w-24 font-medium">{r.type}</span>
                    <Input type="number" min="0" placeholder="Rate/day" value={r.rate}
                      onChange={(e) => { const nr = [...newStage.rates]; nr[i].rate = e.target.value; setNewStage({ ...newStage, rates: nr }); }}
                      className="text-sm h-8 flex-1" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Optional notes" value={newStage.notes} onChange={(e) => setNewStage({ ...newStage, notes: e.target.value })} rows={2} className="text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddStagePopup(null)}>Cancel</Button>
            <Button size="sm" onClick={handleAddStage} disabled={addingSaving} className="gap-1" data-testid="save-stage-btn">
              <Plus className="h-3 w-3" /> {addingSaving ? 'Adding...' : 'Add Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Attendance Log Table Sub-component
function AttendanceTable({ records, onClickRecord }) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-gray-700 mb-2">Attendance Log ({records.length} days)</h5>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-2.5 py-1.5 font-medium text-gray-600">Date</th>
              <th className="text-left px-2.5 py-1.5 font-medium text-gray-600">Breakdown</th>
              <th className="text-center px-2.5 py-1.5 font-medium text-gray-600">Total</th>
              <th className="text-right px-2.5 py-1.5 font-medium text-gray-600">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map(r => (
              <tr key={r.attendance_id} className="hover:bg-blue-50 cursor-pointer" onClick={() => onClickRecord(r)} data-testid={`att-row-${r.attendance_id}`}>
                <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-2.5 py-1.5 text-gray-500">
                  {(r.entries || []).map(e => `${e.type || e.label}: ${e.count}`).join(', ')}
                </td>
                <td className="px-2.5 py-1.5 text-center">{r.total_workers}</td>
                <td className="px-2.5 py-1.5 text-right font-semibold">{formatCurrency(r.total_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-blue-50 border-t-2 border-blue-200">
            <tr>
              <td className="px-2.5 py-1.5 font-bold text-blue-800" colSpan={2}>Total</td>
              <td className="px-2.5 py-1.5 text-center font-bold text-blue-800">{records.reduce((s, r) => s + (r.total_workers || 0), 0)}</td>
              <td className="px-2.5 py-1.5 text-right font-bold text-blue-800">{formatCurrency(records.reduce((s, r) => s + (r.total_cost || 0), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
