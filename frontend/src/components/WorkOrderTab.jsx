import { useState, useEffect, useCallback } from 'react';
import {
  Users, ChevronRight, ArrowLeft, Calendar, Send,
  Clock, CheckCircle, XCircle, AlertCircle, Wallet,
  ClipboardList, ChevronDown, ChevronUp, Banknote
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

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return str; }
}

const STAGE_STATUS = {
  pending: { label: 'Active', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Clock },
  requested: { label: 'Payment Requested', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertCircle },
  procurement_approved: { label: 'Procurement OK', color: 'bg-purple-100 text-purple-800 border-purple-300', icon: CheckCircle },
  planning_approved: { label: 'Planning OK', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: CheckCircle },
  approved: { label: 'Payment Released', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
};

export default function WorkOrderTab({ projectId }) {
  const [contractors, setContractors] = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [expandedStage, setExpandedStage] = useState(null);
  const [stageAttendance, setStageAttendance] = useState({});
  const [loading, setLoading] = useState(false);

  // Attendance popup state
  const [attendancePopup, setAttendancePopup] = useState(null); // { stage, workOrder }
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [attCount, setAttCount] = useState('');
  const [attSaving, setAttSaving] = useState(false);

  // Payment request popup state
  const [paymentPopup, setPaymentPopup] = useState(null); // { stage, workOrder }
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/projects/${projectId}/assigned-contractors`);
      setContractors(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchContractors(); }, [fetchContractors]);

  const fetchStageAttendance = async (workOrderId, stageId) => {
    try {
      const res = await axios.get(`${API}/labour-attendance?work_order_id=${workOrderId}&stage_id=${stageId}`);
      setStageAttendance(prev => ({ ...prev, [`${workOrderId}_${stageId}`]: res.data }));
    } catch (e) { console.error(e); }
  };

  const handleExpandStage = (wo, stage) => {
    const key = `${wo.work_order_id}_${stage.stage_id}`;
    if (expandedStage === key) {
      setExpandedStage(null);
    } else {
      setExpandedStage(key);
      fetchStageAttendance(wo.work_order_id, stage.stage_id);
    }
  };

  const handleSubmitAttendance = async () => {
    if (!attCount || parseInt(attCount) <= 0) {
      toast.error('Enter the number of employees');
      return;
    }
    setAttSaving(true);
    const { stage, workOrder } = attendancePopup;
    const dailyRate = stage.daily_rate || 0;
    const count = parseInt(attCount);
    try {
      await axios.post(`${API}/labour-attendance`, {
        project_id: projectId,
        contractor_id: selectedContractor.contractor_id,
        contractor_name: selectedContractor.contractor_name,
        work_order_id: workOrder.work_order_id,
        stage_id: stage.stage_id,
        date: attDate,
        entries: [{ type: 'Worker', label: 'Worker', count, per_day_cost: dailyRate, total: count * dailyRate }],
        notes: `${count} workers @ ${formatCurrency(dailyRate)}/day`
      });
      toast.success(`Attendance recorded: ${count} workers on ${attDate}`);
      setAttendancePopup(null);
      setAttCount('');
      // Refresh data
      fetchContractors();
      fetchStageAttendance(workOrder.work_order_id, stage.stage_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save attendance');
    } finally { setAttSaving(false); }
  };

  const handleRequestPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setPaymentSaving(true);
    const { stage, workOrder } = paymentPopup;
    try {
      await axios.patch(`${API}/labour-work-orders/${workOrder.work_order_id}/stages/${stage.stage_id}/request-payment`, {
        requested_amount: parseFloat(paymentAmount),
        notes: paymentNotes
      });
      toast.success('Payment requested! Goes to Procurement for approval.');
      setPaymentPopup(null);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchContractors();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to request payment');
    } finally { setPaymentSaving(false); }
  };

  const isStageActive = (stage) => stage.status !== 'approved';

  // ===== CONTRACTOR LIST VIEW =====
  if (!selectedContractor) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            Assigned Contractors
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
              <p className="text-xs mt-1">Planning will assign contractors to this project</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="wo-contractor-list">
              {contractors.map(c => {
                const totalWOs = c.work_orders?.length || 0;
                const totalStages = c.work_orders?.reduce((s, wo) => s + (wo.payment_stages?.length || 0), 0) || 0;
                const activeStages = c.work_orders?.reduce((s, wo) => s + (wo.payment_stages?.filter(st => st.status !== 'approved').length || 0), 0) || 0;
                const totalAmount = c.work_orders?.reduce((s, wo) => s + (wo.total_amount || 0), 0) || 0;
                return (
                  <div
                    key={c.contractor_id}
                    className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all group"
                    onClick={() => setSelectedContractor(c)}
                    data-testid={`wo-contractor-${c.contractor_id}`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{c.contractor_name}</h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5">{c.contractor_type || 'General'}</Badge>
                        <span className="text-[10px] text-gray-400">{totalWOs} WO | {activeStages}/{totalStages} active stages</span>
                        <span className="text-[10px] font-medium text-blue-600">{formatCurrency(totalAmount)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ===== CONTRACTOR DETAIL — WORK ORDER STAGES TIMELINE =====
  const workOrders = selectedContractor.work_orders || [];

  return (
    <div className="space-y-4">
      {/* Back + Header */}
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
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No work orders found</p>
        </CardContent></Card>
      ) : (
        workOrders.map(wo => {
          const stages = wo.payment_stages || [];
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
                  <Badge className={wo.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} variant="outline">
                    {wo.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 pt-0">
                {stages.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">No stages defined by Planning</p>
                ) : (
                  <div className="relative pl-6 mt-2" data-testid="stage-timeline">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200"></div>

                    <div className="space-y-4">
                      {stages.map((stage, idx) => {
                        const active = isStageActive(stage);
                        const stageKey = `${wo.work_order_id}_${stage.stage_id}`;
                        const expanded = expandedStage === stageKey;
                        const records = stageAttendance[stageKey] || [];
                        const statusCfg = STAGE_STATUS[stage.status] || STAGE_STATUS.pending;
                        const StatusIcon = statusCfg.icon;
                        const spendPercent = stage.amount > 0 ? Math.min(100, Math.round((stage.total_spend || 0) / stage.amount * 100)) : 0;

                        return (
                          <div
                            key={stage.stage_id}
                            className={`relative ${!active ? 'opacity-50' : ''}`}
                            data-testid={`stage-${stage.stage_id}`}
                          >
                            {/* Timeline dot */}
                            <div className={`absolute -left-6 mt-1 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 ${
                              active ? 'bg-white border-blue-500' : 'bg-gray-100 border-gray-300'
                            }`}>
                              <StatusIcon className={`h-3 w-3 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                            </div>

                            <div
                              className={`border rounded-lg overflow-hidden transition-all ${
                                active ? 'border-blue-200 bg-white hover:shadow-sm' : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              {/* Stage Header — Clickable */}
                              <div
                                className={`p-3 cursor-pointer ${active ? 'hover:bg-blue-50/50' : ''}`}
                                onClick={() => active && handleExpandStage(wo, stage)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="text-sm font-semibold text-gray-900">{stage.stage_name}</h4>
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.color}`}>
                                        {statusCfg.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                      <span className="font-medium text-gray-800">{formatCurrency(stage.amount)}</span>
                                      <span>Rate: {formatCurrency(stage.daily_rate || 0)}/day</span>
                                      {stage.start_date && <span>{formatDate(stage.start_date)} → {formatDate(stage.end_date)}</span>}
                                    </div>
                                    {/* Spend bar */}
                                    {(stage.total_spend > 0 || stage.total_attendance_days > 0) && (
                                      <div className="mt-2">
                                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                                          <span className="text-gray-500">{stage.total_attendance_days || 0} days worked | Spent: {formatCurrency(stage.total_spend || 0)}</span>
                                          <span className="font-medium text-gray-700">{spendPercent}%</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${spendPercent > 80 ? 'bg-red-500' : spendPercent > 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                            style={{ width: `${spendPercent}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {active && (expanded ? <ChevronUp className="h-4 w-4 text-gray-400 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 mt-1" />)}
                                </div>
                              </div>

                              {/* Expanded Stage Content */}
                              {expanded && active && (
                                <div className="border-t p-3 space-y-3 bg-gray-50/50">
                                  {/* Action Buttons */}
                                  <div className="flex gap-2 flex-wrap">
                                    {stage.status === 'pending' && (
                                      <>
                                        <Button
                                          size="sm"
                                          className="gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                          onClick={(e) => { e.stopPropagation(); setAttDate(new Date().toISOString().split('T')[0]); setAttCount(''); setAttendancePopup({ stage, workOrder: wo }); }}
                                          data-testid={`add-attendance-${stage.stage_id}`}
                                        >
                                          <ClipboardList className="h-3 w-3" /> Daily Attendance
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="gap-1 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                                          onClick={(e) => { e.stopPropagation(); setPaymentAmount(''); setPaymentNotes(''); setPaymentPopup({ stage, workOrder: wo }); }}
                                          data-testid={`req-payment-${stage.stage_id}`}
                                        >
                                          <Banknote className="h-3 w-3" /> Request Payment
                                        </Button>
                                      </>
                                    )}
                                    {stage.status === 'requested' && (
                                      <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded border border-amber-200 flex items-center gap-1.5">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        Payment of {formatCurrency(stage.requested_amount)} requested — awaiting Procurement approval
                                      </div>
                                    )}
                                    {stage.status === 'procurement_approved' && (
                                      <div className="text-xs text-purple-700 bg-purple-50 px-3 py-2 rounded border border-purple-200 flex items-center gap-1.5">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        Procurement approved — awaiting Planning approval
                                      </div>
                                    )}
                                    {stage.status === 'planning_approved' && (
                                      <div className="text-xs text-indigo-700 bg-indigo-50 px-3 py-2 rounded border border-indigo-200 flex items-center gap-1.5">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        Planning approved — awaiting Accountant to release payment
                                      </div>
                                    )}
                                  </div>

                                  {/* Attendance Records */}
                                  {records.length > 0 ? (
                                    <div>
                                      <h5 className="text-xs font-semibold text-gray-700 mb-2">Attendance Log ({records.length} days)</h5>
                                      <div className="rounded-lg border overflow-hidden">
                                        <table className="w-full text-xs">
                                          <thead className="bg-gray-100">
                                            <tr>
                                              <th className="text-left px-2.5 py-1.5 font-medium text-gray-600">Date</th>
                                              <th className="text-center px-2.5 py-1.5 font-medium text-gray-600">Workers</th>
                                              <th className="text-right px-2.5 py-1.5 font-medium text-gray-600">Cost</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y">
                                            {records.map(r => (
                                              <tr key={r.attendance_id} className="hover:bg-gray-50">
                                                <td className="px-2.5 py-1.5 font-medium">{formatDate(r.date)}</td>
                                                <td className="px-2.5 py-1.5 text-center">{r.total_workers}</td>
                                                <td className="px-2.5 py-1.5 text-right font-medium">{formatCurrency(r.total_cost)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                                            <tr>
                                              <td className="px-2.5 py-1.5 font-bold text-blue-800">Total</td>
                                              <td className="px-2.5 py-1.5 text-center font-bold text-blue-800">
                                                {records.reduce((s, r) => s + (r.total_workers || 0), 0)}
                                              </td>
                                              <td className="px-2.5 py-1.5 text-right font-bold text-blue-800">
                                                {formatCurrency(records.reduce((s, r) => s + (r.total_cost || 0), 0))}
                                              </td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 text-center py-2">No attendance records yet for this stage</p>
                                  )}
                                </div>
                              )}

                              {/* Completed stage info */}
                              {!active && stage.status === 'approved' && (
                                <div className="border-t px-3 py-2 bg-green-50/50 text-xs text-green-700 flex items-center gap-1.5">
                                  <CheckCircle className="h-3 w-3" />
                                  Paid: {formatCurrency(stage.approved_amount || stage.amount)} on {formatDate(stage.approved_at)}
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
        })
      )}

      {/* ===== DAILY ATTENDANCE POPUP ===== */}
      <Dialog open={!!attendancePopup} onOpenChange={(v) => { if (!v) setAttendancePopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="attendance-popup">
          <DialogHeader>
            <DialogTitle className="text-base">Daily Attendance</DialogTitle>
            <DialogDescription className="text-xs">
              {attendancePopup?.stage?.stage_name} — Rate: {formatCurrency(attendancePopup?.stage?.daily_rate || 0)}/worker/day
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="text-sm mt-1" data-testid="att-date" />
            </div>
            <div>
              <Label className="text-xs">Number of Employees</Label>
              <Input
                type="number"
                min="1"
                placeholder="Enter worker count"
                value={attCount}
                onChange={(e) => setAttCount(e.target.value)}
                className="text-sm mt-1 text-lg font-semibold"
                data-testid="att-count"
              />
            </div>
            {attCount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-600">Daily Cost</p>
                <p className="text-xl font-bold text-blue-800" data-testid="att-daily-cost">
                  {formatCurrency(parseInt(attCount || 0) * (attendancePopup?.stage?.daily_rate || 0))}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {attCount} workers x {formatCurrency(attendancePopup?.stage?.daily_rate || 0)}/day
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAttendancePopup(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSubmitAttendance} disabled={attSaving} className="gap-1" data-testid="submit-att-btn">
              <Send className="h-3 w-3" /> {attSaving ? 'Saving...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== REQUEST PAYMENT POPUP ===== */}
      <Dialog open={!!paymentPopup} onOpenChange={(v) => { if (!v) setPaymentPopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="payment-popup">
          <DialogHeader>
            <DialogTitle className="text-base">Request Payment</DialogTitle>
            <DialogDescription className="text-xs">
              {paymentPopup?.stage?.stage_name} — Stage Amount: {formatCurrency(paymentPopup?.stage?.amount || 0)}
            </DialogDescription>
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
              <Input
                type="number"
                min="1"
                placeholder="Enter amount to request"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="text-sm mt-1 text-lg font-semibold"
                data-testid="payment-amount"
              />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                placeholder="Reason for payment request..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={2}
                className="text-sm mt-1"
              />
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
    </div>
  );
}
