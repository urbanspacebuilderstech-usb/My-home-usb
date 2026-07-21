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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  planning_initial_pending: { label: 'Awaiting Planning', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Clock, step: 1 },
  planning_initial_rejected: { label: 'Planning Rejected', color: 'bg-rose-100 text-rose-800 border-rose-300', icon: XCircle, step: 1 },
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
  // Each entry must include the canonical timestamp field name so we can sort
  // chronologically. The lifecycle now spans: SE created → Procurement priced
  // (or revised) → Planning approved (or sent back) → Accountant payment
  // (full / advance / balance) → Transit → Delivered.
  if (req.created_at) events.push({ label: 'Request Created', by: req.site_engineer_name || 'Site Engineer', date: req.created_at, icon: FileText, color: 'text-gray-600' });
  if (req.procurement_priced_at) events.push({
    label: `Vendor Assigned${req.vendor_name ? ` → ${req.vendor_name}` : ''}`,
    by: req.procurement_priced_by_name || 'Procurement',
    date: req.procurement_priced_at,
    icon: CheckCircle,
    color: 'text-blue-600',
  });
  if (req.revision_requested_at) events.push({
    label: `Revision Requested${req.revision_remarks ? `: "${req.revision_remarks}"` : ''}`,
    by: req.revision_requested_by_name || 'Planning',
    date: req.revision_requested_at,
    icon: XCircle,
    color: 'text-orange-600',
  });
  if (req.planning_approved_at) events.push({
    label: 'Planning Approved',
    by: req.planning_approved_by_name || req.planning_approved_by || 'Planning',
    date: req.planning_approved_at,
    icon: CheckCircle,
    color: 'text-amber-600',
  });
  if (req.planning_rejected_at) events.push({
    label: `Planning Rejected${req.planning_rejection_reason ? `: "${req.planning_rejection_reason}"` : ''}`,
    by: req.planning_rejected_by_name || 'Planning',
    date: req.planning_rejected_at,
    icon: XCircle,
    color: 'text-red-600',
  });
  // Accountant — surface awaiting state if present (no timestamp from server but
  // status indicates we're waiting on them).
  if ((req.status === 'pending_accounts_approval' || req.status === 'pending_balance_payment') && !req.last_payment_at) {
    events.push({
      label: req.status === 'pending_balance_payment' ? 'Awaiting Balance Payment (Accountant)' : 'Awaiting Accountant Approval',
      by: '—',
      date: req.planning_approved_at || req.procurement_priced_at || req.created_at,
      icon: Clock,
      color: 'text-cyan-600',
      pending: true,
    });
  }
  if (req.last_payment_at) events.push({
    label: `Payment Released${req.last_payment_phase ? ` (${req.last_payment_phase})` : ''}`,
    by: req.last_payment_method ? `${req.last_payment_method.toUpperCase()}` : 'Accountant',
    date: req.last_payment_at,
    icon: CheckCircle,
    color: 'text-emerald-600',
  });
  // Advance-mode's own two payment legs, released via the Pay & Settle
  // dialog — these stamp advance_paid_at / collected_at / balance_paid_at
  // rather than accountant_approved_at / last_payment_at, so without these
  // the timeline showed a gap after Vendor Assigned even when the advance
  // had genuinely been paid and the SE had collected the material.
  if (req.advance_paid_at) events.push({
    label: `Accountant Released Advance Payment${req.advance_paid_amount ? ` (${formatCurrency(req.advance_paid_amount)})` : ''}`,
    by: req.advance_paid_by_name || 'Accountant',
    date: req.advance_paid_at,
    icon: CheckCircle,
    color: 'text-cyan-600',
  });
  if (req.collected_at) events.push({
    label: 'SE Marked Collected',
    by: req.collected_by_name || 'Site Engineer',
    date: req.collected_at,
    icon: Package,
    color: 'text-lime-600',
  });
  if (req.balance_paid_at) events.push({
    label: `Accountant Released Balance Payment${req.balance_paid_amount ? ` (${formatCurrency(req.balance_paid_amount)})` : ''}`,
    by: req.balance_paid_by_name || 'Accountant',
    date: req.balance_paid_at,
    icon: CheckCircle,
    color: 'text-emerald-600',
  });
  if (req.accountant_approved_at && req.accountant_approved_at !== req.last_payment_at) events.push({
    label: 'Accountant Approved',
    by: req.accountant_approved_by || 'Accountant',
    date: req.accountant_approved_at,
    icon: CheckCircle,
    color: 'text-emerald-600',
  });
  if (req.transit_started_at) events.push({
    label: 'In Transit',
    by: req.vendor_name || 'Vendor',
    date: req.transit_started_at,
    icon: Truck,
    color: 'text-sky-600',
  });
  if (req.po_generated_at) events.push({ label: 'PO Generated', by: 'System', date: req.po_generated_at, icon: FileText, color: 'text-cyan-600' });
  if (req.dispatched_at && req.dispatched_at !== req.transit_started_at) events.push({ label: 'Material Dispatched', by: req.vendor_name || 'Vendor', date: req.dispatched_at, icon: Truck, color: 'text-blue-600' });
  if (req.received_at) events.push({ label: 'Material Received', by: req.received_by_name || req.site_engineer_name || 'Site Engineer', date: req.received_at, icon: Package, color: 'text-green-600' });
  if (req.delivered_at && req.delivered_at !== req.received_at) events.push({ label: 'Delivered', by: req.received_by_name || 'Site Engineer', date: req.delivered_at, icon: Package, color: 'text-emerald-600' });
  if (req.rejected_by || req.procurement_rejected_at) events.push({
    label: `Rejected: ${req.rejection_reason || req.procurement_rejection_reason || 'No reason'}`,
    by: req.rejected_by || req.procurement_rejected_by_name || 'Reviewer',
    date: req.rejected_at || req.procurement_rejected_at || req.updated_at,
    icon: XCircle,
    color: 'text-red-600',
  });
  // Sort chronologically — defensive against missing timestamps.
  return events.sort((a, b) => {
    const ad = a.date ? new Date(a.date).getTime() : 0;
    const bd = b.date ? new Date(b.date).getTime() : 0;
    return ad - bd;
  });
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
                  <span className="text-xs text-gray-500 font-mono">{order.request_number || order.order_id}</span>
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

        <div className="px-4 py-4 sm:px-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="details" data-testid="order-tab-details">Details</TabsTrigger>
              <TabsTrigger value="timeline" data-testid="order-tab-timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-5 mt-0">
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

              {/* ── Steel Breakdown ──────────────────────────────────────────
                  Mirror of the per-diameter / rod-count table that the SE
                  material request CARD already shows, so the popup detail
                  view contains the full steel composition instead of just
                  the aggregate kg (which was useless to procurement). Falls
                  back to the legacy single-row format for pre-multi-item
                  steel requests. */}
              {order.steel_specs?.items?.length > 0 ? (
                <div className="col-span-2 border border-amber-300 rounded-md bg-amber-50 p-2.5" data-testid="detail-steel-breakdown">
                  <p className="text-[11px] font-semibold text-amber-800 uppercase mb-1.5">
                    ⚙ Steel — {order.steel_specs.total_items} item{order.steel_specs.total_items === 1 ? '' : 's'} · {order.steel_specs.total_rods} rods · {order.steel_specs.total_weight_kg} kg
                  </p>
                  <table className="w-full text-[11px]">
                    <thead className="text-gray-500 uppercase">
                      <tr>
                        <th className="text-left py-1 w-6">#</th>
                        <th className="text-left py-1">Diameter</th>
                        <th className="text-right py-1">Rods (40 ft)</th>
                        <th className="text-right py-1">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.steel_specs.items.map((it, ii) => (
                        <tr key={ii} className="border-t border-amber-200">
                          <td className="py-1">{ii + 1}</td>
                          <td className="font-semibold text-slate-800 py-1">Ø {it.diameter_mm} mm</td>
                          <td className="text-right py-1">{it.rod_count}</td>
                          <td className="text-right font-semibold text-amber-700 py-1">{it.calculated_weight_kg} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : order.steel_specs ? (
                <div className="col-span-2 border border-amber-300 rounded-md bg-amber-50 p-2.5" data-testid="detail-steel-breakdown-single">
                  <p className="text-[11px] text-amber-800">
                    <strong>⚙ Steel:</strong> Ø{order.steel_specs.diameter_mm}mm × {order.steel_specs.rod_count} rods (40 ft) ={' '}
                    <span className="font-bold text-amber-700">{order.steel_specs.calculated_weight_kg} kg</span>
                  </p>
                </div>
              ) : null}

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

              {/* Stage field removed from view popup (Feb 2026). Stages
                  aren't yet wired into the SE material request workflow so
                  it was always rendering "—". Re-add when stage selection
                  becomes mandatory at request creation. */}

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

              {/* Required Date removed from view popup (Feb 2026) — the
                  SE workflow uses Expected Delivery instead, so the field
                  was always blank. Re-add if a separate "required-by" date
                  becomes part of the request payload. */}

              {/* Expected Delivery — falls back to SE-selected delivery if material request was raised via the SE flow */}
              <div>
                <Label className="text-xs text-gray-500">Expected Delivery</Label>
                {editing ? (
                  <Input type="date" value={form.expected_delivery} onChange={(e) => setForm({...form, expected_delivery: e.target.value})} className="text-sm mt-1" />
                ) : (
                  <p className="text-sm font-medium mt-0.5">
                    {(() => {
                      const d = order.expected_delivery || order.se_expected_delivery;
                      if (!d) return '—';
                      try {
                        const dt = new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                        return order.se_delivery_choice ? `${dt} · ${order.se_delivery_choice.toUpperCase()}` : dt;
                      } catch { return d; }
                    })()}
                  </p>
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

          {/* Approval Timeline → moved into the Timeline tab below */}
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              {timeline.length > 0 ? (
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
              ) : (
                <div className="text-center py-10 text-gray-400 text-sm">No timeline events recorded yet.</div>
              )}
            </TabsContent>
          </Tabs>

          {/* Delivery photos & GPS — visible to Procurement / Planning / Accountant after SE marks received */}
          {(order.lorry_image_id || order.vehicle_front_image_id || order.vehicle_side_image_id || order.material_image_id || order.dp_copy_image_id || order.received_at) && !editing && (
            <div className="bg-emerald-50/50 rounded-lg p-3 border border-emerald-100" data-testid="order-delivery-photos">
              <h3 className="text-xs sm:text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" /> Delivery Photos & Receipt
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  // Legacy receipts (before the 4-photo split) only had `lorry_image_id`.
                  ...(!order.vehicle_front_image_id && !order.vehicle_side_image_id && order.lorry_image_id
                    ? [{ key: 'lorry', id: order.lorry_image_id, label: 'Lorry / Truck', empty: 'No lorry image' }]
                    : [
                        { key: 'vehicle_front', id: order.vehicle_front_image_id, label: 'Vehicle Front View', empty: 'No vehicle front image' },
                        { key: 'vehicle_side', id: order.vehicle_side_image_id, label: 'Vehicle Side View', empty: 'No vehicle side image' },
                      ]),
                  { key: 'material', id: order.material_image_id, label: 'Material', empty: 'No material image' },
                  { key: 'dp_copy', id: order.dp_copy_image_id, label: 'DP Copy', empty: 'No DP copy' },
                ].map((p) => (
                  p.id ? (
                    <a
                      key={p.key}
                      href={`${API}/files/${p.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md overflow-hidden border border-emerald-200 bg-white hover:border-emerald-400 transition-colors"
                      data-testid={`${p.key}-image-link`}
                    >
                      <img
                        src={`${API}/files/${p.id}/download`}
                        alt={p.label}
                        className="w-full h-32 sm:h-40 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 bg-emerald-100/60 py-1 px-2">{p.label}</p>
                    </a>
                  ) : (
                    <div key={p.key} className="rounded-md border border-dashed border-gray-300 bg-white h-32 sm:h-40 flex items-center justify-center">
                      <p className="text-[11px] text-gray-400">{p.empty}</p>
                    </div>
                  )
                ))}
              </div>
              {(order.received_quantity || order.received_at || order.received_by_name) && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {order.received_quantity != null && (
                    <div><p className="text-[10px] uppercase font-semibold text-gray-500">Received Qty</p><p className="font-medium">{order.received_quantity} {order.unit || ''}</p></div>
                  )}
                  {order.received_at && (
                    <div><p className="text-[10px] uppercase font-semibold text-gray-500">Received At</p><p className="font-medium">{formatDate(order.received_at)}</p></div>
                  )}
                  {order.received_by_name && (
                    <div><p className="text-[10px] uppercase font-semibold text-gray-500">Received By</p><p className="font-medium">{order.received_by_name}</p></div>
                  )}
                </div>
              )}
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
