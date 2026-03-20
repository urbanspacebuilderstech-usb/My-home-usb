import { useState, useEffect } from 'react';
import { 
  Clock, CheckCircle, XCircle, Truck, Package, Save, 
  Calendar, User, MapPin, FileText, ArrowRight, Pencil, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  requested: { label: 'Requested', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Clock, step: 1 },
  pm_approved: { label: 'PM Approved', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: CheckCircle, step: 2 },
  planning_approved: { label: 'Planning Approved', color: 'bg-amber-50 text-amber-800 border-amber-300', icon: CheckCircle, step: 3 },
  procurement_approved: { label: 'Procurement Approved', color: 'bg-purple-100 text-purple-800 border-purple-300', icon: CheckCircle, step: 4 },
  pending_accounts_approval: { label: 'Pending Accounts', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Clock, step: 5 },
  accounts_approved: { label: 'Accounts Approved', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, step: 5 },
  accountant_approved: { label: 'Accounts Approved', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, step: 5 },
  vendor_selected: { label: 'Vendor Selected', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: CheckCircle, step: 4 },
  waiting_payment: { label: 'Awaiting Payment', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: Clock, step: 5 },
  payment_approved: { label: 'Payment Approved', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, step: 6 },
  po_generated: { label: 'PO Generated', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', icon: CheckCircle, step: 6 },
  ready_for_delivery: { label: 'Ready for Delivery', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', icon: Truck, step: 7 },
  in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Truck, step: 7 },
  delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800 border-teal-300', icon: Truck, step: 8 },
  received_partial: { label: 'Partially Received', color: 'bg-orange-100 text-orange-800 border-orange-300', icon: Package, step: 9 },
  received_completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, step: 10 },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, step: 10 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-300', icon: XCircle, step: -1 }
};

const URGENCY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const STAGE_OPTIONS = ['Foundation', 'Superstructure', 'Finishing', 'Plumbing', 'Electrical', 'Painting', 'Flooring', 'Roofing'];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function buildTimeline(req) {
  const events = [];
  if (req.created_at) events.push({ label: 'Request Created', by: req.site_engineer_name || 'Site Engineer', date: req.created_at, icon: FileText, color: 'text-gray-600' });
  if (req.planning_approved_at) events.push({ label: 'Planning Approved', by: req.planning_approved_by || 'Planning', date: req.planning_approved_at, icon: CheckCircle, color: 'text-amber-600' });
  if (req.procurement_approved_at) events.push({ label: 'Procurement Processed', by: req.procurement_approved_by || 'Procurement', date: req.procurement_approved_at, icon: CheckCircle, color: 'text-purple-600' });
  if (req.accountant_approved_at) events.push({ label: 'Accounts Approved', by: req.accountant_approved_by || 'Accountant', date: req.accountant_approved_at, icon: CheckCircle, color: 'text-green-600' });
  if (req.po_generated_at) events.push({ label: 'PO Generated', by: 'System', date: req.po_generated_at, icon: FileText, color: 'text-cyan-600' });
  if (req.dispatched_at) events.push({ label: 'Material Dispatched', by: req.vendor_name || 'Vendor', date: req.dispatched_at, icon: Truck, color: 'text-blue-600' });
  if (req.received_at) events.push({ label: 'Material Received', by: req.site_engineer_name || 'Site Engineer', date: req.received_at, icon: Package, color: 'text-green-600' });
  if (req.rejected_by) events.push({ label: `Rejected: ${req.rejection_reason || 'No reason'}`, by: req.rejected_by, date: req.rejected_at || req.updated_at, icon: XCircle, color: 'text-red-600' });
  return events;
}

export default function OrderDetailDialog({ open, onClose, order, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (order) {
      setForm({
        material_name: order.material_name || '',
        quantity: order.quantity?.toString() || '',
        unit: order.unit || 'kg',
        remarks: order.remarks || '',
        urgency: order.urgency || 'medium',
        stage: order.stage || '',
        required_date: order.required_date || '',
        expected_delivery: order.expected_delivery || '',
      });
      setEditing(false);
    }
  }, [order]);

  if (!order) return null;

  const statusConfig = STATUS_CONFIG[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-800', icon: Clock };
  const StatusIcon = statusConfig.icon;
  const timeline = buildTimeline(order);

  // Editable only in early stages
  const canEdit = ['requested', 'planning_approved'].includes(order.status);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {};
      if (form.material_name !== order.material_name) updates.material_name = form.material_name;
      if (parseFloat(form.quantity) !== order.quantity) updates.quantity = parseFloat(form.quantity);
      if (form.unit !== order.unit) updates.unit = form.unit;
      if (form.remarks !== (order.remarks || '')) updates.remarks = form.remarks;
      if (form.urgency !== (order.urgency || 'medium')) updates.urgency = form.urgency;
      if (form.stage !== (order.stage || '')) updates.stage = form.stage;
      if (form.required_date !== (order.required_date || '')) updates.required_date = form.required_date;
      if (form.expected_delivery !== (order.expected_delivery || '')) updates.expected_delivery = form.expected_delivery;

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save');
        setEditing(false);
        setSaving(false);
        return;
      }

      await axios.patch(`${API}/site-engineer/material-requests/${order.request_id}`, updates);
      toast.success('Order updated successfully');
      setEditing(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl mx-auto max-h-[90vh] overflow-y-auto p-0" data-testid="order-detail-dialog">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 sm:px-6 sm:py-4 rounded-t-lg">
          <DialogHeader className="space-y-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold truncate" data-testid="order-detail-title">
                  {order.material_name}
                </DialogTitle>
                <DialogDescription className="sr-only">Order details and approval timeline</DialogDescription>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-500 font-mono">{order.order_id}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </span>
                </div>
              </div>
              {canEdit && !editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1 text-xs" data-testid="edit-order-btn">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-1 text-xs text-gray-500">
                  <X className="h-3 w-3" /> Cancel
                </Button>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="px-4 py-4 sm:px-6 space-y-5">
          {/* Order Details Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Package className="h-4 w-4 text-orange-600" /> Order Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Material Name */}
              <div className="col-span-2">
                <Label className="text-xs text-gray-500">Material Name</Label>
                {editing ? (
                  <Input value={form.material_name} onChange={(e) => setForm({...form, material_name: e.target.value})} className="text-sm mt-1" data-testid="edit-material-name" />
                ) : (
                  <p className="text-sm font-medium mt-0.5" data-testid="detail-material-name">{order.material_name}</p>
                )}
              </div>

              {/* Quantity */}
              <div>
                <Label className="text-xs text-gray-500">Quantity</Label>
                {editing ? (
                  <Input type="number" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})} className="text-sm mt-1" data-testid="edit-quantity" />
                ) : (
                  <p className="text-sm font-medium mt-0.5" data-testid="detail-quantity">{order.quantity} {order.unit}</p>
                )}
              </div>

              {/* Unit */}
              <div>
                <Label className="text-xs text-gray-500">Unit</Label>
                {editing ? (
                  <Select value={form.unit} onValueChange={(v) => setForm({...form, unit: v})}>
                    <SelectTrigger className="text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['kg', 'bag', 'Bags', 'Tonnes', 'Cubic Feet', 'Cubic Meters', 'Pieces', 'Coils', 'Boxes', 'Sheets', 'Sqft', 'KG', 'Litres', 'Sets'].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium mt-0.5">{order.unit}</p>
                )}
              </div>

              {/* Stage */}
              <div>
                <Label className="text-xs text-gray-500">Stage</Label>
                {editing ? (
                  <Select value={form.stage} onValueChange={(v) => setForm({...form, stage: v})}>
                    <SelectTrigger className="text-sm mt-1"><SelectValue placeholder="Select stage" /></SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium mt-0.5" data-testid="detail-stage">{order.stage || '—'}</p>
                )}
              </div>

              {/* Urgency */}
              <div>
                <Label className="text-xs text-gray-500">Urgency</Label>
                {editing ? (
                  <Select value={form.urgency} onValueChange={(v) => setForm({...form, urgency: v})}>
                    <SelectTrigger className="text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {URGENCY_OPTIONS.map(u => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium mt-0.5 capitalize" data-testid="detail-urgency">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${order.urgency === 'critical' ? 'bg-red-500' : order.urgency === 'high' ? 'bg-orange-500' : order.urgency === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                    {order.urgency || 'medium'}
                  </p>
                )}
              </div>

              {/* Required Date */}
              <div>
                <Label className="text-xs text-gray-500">Required Date</Label>
                {editing ? (
                  <Input type="date" value={form.required_date} onChange={(e) => setForm({...form, required_date: e.target.value})} className="text-sm mt-1" />
                ) : (
                  <p className="text-sm font-medium mt-0.5">{order.required_date || '—'}</p>
                )}
              </div>

              {/* Expected Delivery */}
              <div>
                <Label className="text-xs text-gray-500">Expected Delivery</Label>
                {editing ? (
                  <Input type="date" value={form.expected_delivery} onChange={(e) => setForm({...form, expected_delivery: e.target.value})} className="text-sm mt-1" />
                ) : (
                  <p className="text-sm font-medium mt-0.5">{order.expected_delivery || '—'}</p>
                )}
              </div>

              {/* Remarks */}
              <div className="col-span-2">
                <Label className="text-xs text-gray-500">Remarks</Label>
                {editing ? (
                  <Textarea value={form.remarks} onChange={(e) => setForm({...form, remarks: e.target.value})} rows={2} className="text-sm mt-1" data-testid="edit-remarks" />
                ) : (
                  <p className="text-sm mt-0.5 text-gray-700">{order.remarks || '—'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Vendor & Pricing Section */}
          {(order.vendor_name || order.assigned_vendor_name || order.total_amount) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <User className="h-4 w-4 text-blue-600" /> Vendor & Pricing
              </h3>
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 space-y-2">
                {(order.vendor_name || order.assigned_vendor_name) && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Vendor</span>
                    <span className="text-sm font-medium text-blue-800" data-testid="detail-vendor">{order.vendor_name || order.assigned_vendor_name}</span>
                  </div>
                )}
                {order.unit_rate > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Unit Rate</span>
                    <span className="text-sm font-medium">{formatCurrency(order.unit_rate)}/{order.unit}</span>
                  </div>
                )}
                {order.transport_cost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Transport</span>
                    <span className="text-sm font-medium">{formatCurrency(order.transport_cost)}</span>
                  </div>
                )}
                {order.discount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Discount</span>
                    <span className="text-sm font-medium text-green-600">-{formatCurrency(order.discount)}</span>
                  </div>
                )}
                {order.total_amount > 0 && (
                  <div className="flex justify-between items-center border-t pt-2 mt-2">
                    <span className="text-xs font-semibold text-gray-700">Total Amount</span>
                    <span className="text-sm font-bold text-gray-900" data-testid="detail-total">{formatCurrency(order.total_amount)}</span>
                  </div>
                )}
                {order.payment_type && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Payment Type</span>
                    <Badge variant="outline" className="text-xs capitalize">{order.payment_type}</Badge>
                  </div>
                )}
                {order.po_id && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Purchase Order</span>
                    <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">{order.po_id}</Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transit Info */}
          {(order.vehicle_number || order.receipt_otp) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-blue-600" /> Transit Details
              </h3>
              <div className="bg-gray-50 border rounded-lg p-3 grid grid-cols-2 gap-2">
                {order.vehicle_number && (
                  <div>
                    <span className="text-xs text-gray-500 block">Vehicle</span>
                    <span className="text-sm font-medium">{order.vehicle_number}</span>
                  </div>
                )}
                {order.driver_phone && (
                  <div>
                    <span className="text-xs text-gray-500 block">Driver Phone</span>
                    <span className="text-sm font-medium">{order.driver_phone}</span>
                  </div>
                )}
                {order.receipt_otp && (
                  <div>
                    <span className="text-xs text-gray-500 block">Receipt OTP</span>
                    <span className="text-sm font-bold text-orange-600">{order.receipt_otp}</span>
                  </div>
                )}
                {order.estimated_price && (
                  <div>
                    <span className="text-xs text-gray-500 block">Estimated Price</span>
                    <span className="text-sm font-medium">{formatCurrency(order.estimated_price)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Approval Timeline */}
          {timeline.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-gray-600" /> Approval Timeline
              </h3>
              <div className="relative pl-6" data-testid="approval-timeline">
                {/* Vertical line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
                <div className="space-y-3">
                  {timeline.map((event, idx) => {
                    const Icon = event.icon;
                    return (
                      <div key={idx} className="relative flex items-start gap-3">
                        <div className={`absolute -left-6 mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center bg-white border-2 ${idx === timeline.length - 1 ? 'border-orange-400' : 'border-gray-300'}`}>
                          <Icon className={`h-2.5 w-2.5 ${event.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{event.label}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{event.by}</span>
                            <span>·</span>
                            <span>{formatDate(event.date)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Save Button when Editing */}
          {editing && (
            <div className="sticky bottom-0 bg-white border-t pt-3 pb-1 flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1 bg-orange-600 hover:bg-orange-700" data-testid="save-order-btn">
                <Save className="h-3 w-3" /> {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
