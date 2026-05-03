import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Plus, Users, Loader2, Clock, UserCircle, RefreshCw, ArrowRight, Trash2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SLOT_ROLES = [
  { value: 'pre_sales', label: 'Pre-Sales', prefix: 'PreSalesUSB' },
  { value: 'sales', label: 'Sales', prefix: 'SalesUSB' },
  { value: 'cre', label: 'CRE', prefix: 'CREUSB' },
  { value: 'marketing_head', label: 'Marketing', prefix: 'MktgUSB' },
];

export default function SlotManagement() {
  const [user, setUser] = useState(null);
  const [slots, setSlots] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('all');

  const [createDialog, setCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ slot_code: '', label: '', role: 'pre_sales' });
  const [submitting, setSubmitting] = useState(false);

  const [assignDialog, setAssignDialog] = useState({ open: false, slot: null });
  const [assignForm, setAssignForm] = useState({ user_id: '', note: '' });

  const [historyDialog, setHistoryDialog] = useState({ open: false, slot: null, data: [] });

  const [migrating, setMigrating] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [me, slotsRes, usersRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/slots`),
        axios.get(`${API}/users`),
      ]);
      setUser(me.data);
      setSlots(slotsRes.data || []);
      setUsers(usersRes.data || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredSlots = useMemo(() => {
    if (filterRole === 'all') return slots;
    return slots.filter(s => s.role === filterRole);
  }, [slots, filterRole]);

  const groupedByRole = useMemo(() => {
    const groups = {};
    for (const s of filteredSlots) {
      (groups[s.role] = groups[s.role] || []).push(s);
    }
    return groups;
  }, [filteredSlots]);

  const nextSlotCode = (role) => {
    const prefix = SLOT_ROLES.find(r => r.value === role)?.prefix || 'Slot';
    const existing = slots.filter(s => s.role === role).length;
    return `${prefix}${String(existing + 1).padStart(2, '0')}`;
  };

  const openCreate = () => {
    setCreateForm({ slot_code: nextSlotCode('pre_sales'), label: '', role: 'pre_sales' });
    setCreateDialog(true);
  };

  const handleCreate = async () => {
    if (!createForm.slot_code.trim()) { toast.error('Slot code is required'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/slots`, createForm);
      toast.success(`Slot ${createForm.slot_code} created`);
      setCreateDialog(false);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create slot');
    } finally { setSubmitting(false); }
  };

  const openAssign = (slot) => {
    setAssignForm({ user_id: slot.current_holder?.user_id || '', note: '' });
    setAssignDialog({ open: true, slot });
  };

  const handleAssign = async () => {
    if (!assignForm.user_id) { toast.error('Please pick a user'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/slots/${assignDialog.slot.slot_id}/assign`, assignForm);
      toast.success('User assigned to slot. Leads on this slot now belong to the new user.');
      setAssignDialog({ open: false, slot: null });
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to assign');
    } finally { setSubmitting(false); }
  };

  const handleUnassign = async (slot) => {
    if (!window.confirm(`End ${slot.current_holder?.user_name}'s tenure on ${slot.slot_code}? The slot will have no active holder until you assign someone new.`)) return;
    try {
      await axios.post(`${API}/slots/${slot.slot_id}/unassign`);
      toast.success('Assignment closed. Assign a replacement when ready.');
      fetchAll();
    } catch { toast.error('Failed to unassign'); }
  };

  const openHistory = async (slot) => {
    try {
      const r = await axios.get(`${API}/slots/${slot.slot_id}/history`);
      setHistoryDialog({ open: true, slot, data: r.data || [] });
    } catch { toast.error('Failed to load history'); }
  };

  const handleMigrate = async () => {
    if (!window.confirm('Auto-seed slots for every existing Pre-Sales / Sales / CRE / Marketing user that doesn\'t already have a slot, and link their existing leads?\n\nSafe to run multiple times — users who already own a slot are skipped.')) return;
    setMigrating(true);
    try {
      const r = await axios.post(`${API}/slots/migrate`);
      toast.success(`Created ${r.data.slots_created} slots, linked ${r.data.leads_updated} leads.`);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Migration failed');
    } finally { setMigrating(false); }
  };

  const userOptions = useMemo(() => {
    if (!assignDialog.slot) return users;
    return users.filter(u => u.role === assignDialog.slot.role && u.is_active !== false);
  }, [users, assignDialog.slot]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>;
  }

  if (user?.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} />
        <div className="max-w-md mx-auto mt-16 px-4">
          <Card><CardContent className="p-6 text-center">
            <UserCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="font-semibold">Slot management is Super Admin only.</p>
          </CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-6 w-6 text-indigo-600" />
              Slot Management
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Slots let you assign leads to a role-seat (like <code className="bg-gray-100 px-1 rounded text-xs">PreSalesUSB01</code>) instead of a person.
              When someone resigns, swap the user on the seat — leads stay in place, timeline stays intact.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleMigrate} disabled={migrating} variant="outline" data-testid="slot-migrate-btn">
              {migrating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Auto-seed from existing users
            </Button>
            <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700" data-testid="slot-create-btn">
              <Plus className="h-4 w-4 mr-1" /> New Slot
            </Button>
          </div>
        </div>

        {/* Role filter chips */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <FilterChip label={`All (${slots.length})`} active={filterRole === 'all'} onClick={() => setFilterRole('all')} />
          {SLOT_ROLES.map(r => {
            const c = slots.filter(s => s.role === r.value).length;
            return <FilterChip key={r.value} label={`${r.label} (${c})`} active={filterRole === r.value} onClick={() => setFilterRole(r.value)} />;
          })}
        </div>

        {slots.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-gray-700">No slots yet</p>
              <p className="text-sm mt-1 mb-4">Either click <span className="font-semibold text-indigo-600">Auto-seed</span> to create one slot per existing Pre-Sales/Sales/CRE/Marketing user, or create slots manually.</p>
              <Button onClick={handleMigrate} className="bg-indigo-600 hover:bg-indigo-700" disabled={migrating}>
                {migrating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Auto-seed slots now
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedByRole).map(([role, roleSlots]) => (
            <div key={role} className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                {SLOT_ROLES.find(r => r.value === role)?.label || role} ({roleSlots.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {roleSlots.map(slot => (
                  <Card key={slot.slot_id} className="hover:shadow-md transition-shadow border-gray-200" data-testid={`slot-card-${slot.slot_code}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-indigo-600 font-semibold">{slot.slot_code}</p>
                          <p className="font-semibold text-sm mt-0.5">{slot.label}</p>
                        </div>
                        {slot.current_holder ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Active</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Vacant</Badge>
                        )}
                      </div>

                      <div className="mt-3 p-2 rounded bg-gray-50 border border-gray-100">
                        {slot.current_holder ? (
                          <>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Current holder</p>
                            <p className="text-sm font-semibold flex items-center gap-1.5"><UserCircle className="h-4 w-4 text-emerald-600" />{slot.current_holder.user_name}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Since {new Date(slot.current_holder.start_date).toLocaleDateString()}</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500 italic">No one currently assigned</p>
                        )}
                      </div>

                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => openAssign(slot)} className="text-xs h-7" data-testid={`slot-assign-${slot.slot_code}`}>
                          {slot.current_holder ? 'Swap User' : 'Assign User'}
                        </Button>
                        {slot.current_holder && (
                          <Button size="sm" variant="outline" onClick={() => handleUnassign(slot)} className="text-xs h-7 text-red-600 hover:bg-red-50" data-testid={`slot-unassign-${slot.slot_code}`}>
                            End
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openHistory(slot)} className="text-xs h-7 ml-auto" data-testid={`slot-history-${slot.slot_code}`}>
                          <Clock className="h-3 w-3 mr-1" /> History ({slot.history_count})
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---------------- Create Slot Dialog ---------------- */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Slot</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm(p => ({ ...p, role: v, slot_code: nextSlotCode(v) }))}>
                <SelectTrigger data-testid="slot-form-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOT_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Slot Code</Label>
              <Input value={createForm.slot_code} onChange={(e) => setCreateForm(p => ({ ...p, slot_code: e.target.value }))} data-testid="slot-form-code" />
              <p className="text-[10px] text-gray-400 mt-0.5">Stable identifier — leads will point to this. Don't change after creation.</p>
            </div>
            <div>
              <Label className="text-xs">Display Label (optional)</Label>
              <Input value={createForm.label} onChange={(e) => setCreateForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Pre-Sales Seat 01 — Tamil" data-testid="slot-form-label" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Assign User Dialog ---------------- */}
      <Dialog open={assignDialog.open} onOpenChange={(o) => !o && setAssignDialog({ open: false, slot: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{assignDialog.slot?.current_holder ? 'Swap User on' : 'Assign User to'} {assignDialog.slot?.slot_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {assignDialog.slot?.current_holder && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
                <p><span className="font-semibold">{assignDialog.slot.current_holder.user_name}</span> will be removed as holder. Their tenure ends today — it'll be preserved in history.</p>
              </div>
            )}
            <div>
              <Label className="text-xs">Assign To</Label>
              <Select value={assignForm.user_id} onValueChange={(v) => setAssignForm(p => ({ ...p, user_id: v }))}>
                <SelectTrigger data-testid="assign-user-select"><SelectValue placeholder="Pick a teammate" /></SelectTrigger>
                <SelectContent>
                  {userOptions.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.name} ({u.email})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400 mt-0.5">Only users with role <span className="font-mono">{assignDialog.slot?.role}</span> are shown.</p>
            </div>
            <div>
              <Label className="text-xs">Handover Note (optional)</Label>
              <Textarea value={assignForm.note} onChange={(e) => setAssignForm(p => ({ ...p, note: e.target.value }))} rows={2} placeholder="e.g. Kalvirayan resigned — brief Kavitha on pending leads" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog({ open: false, slot: null })}>Cancel</Button>
            <Button onClick={handleAssign} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Assign <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- History Dialog ---------------- */}
      <Dialog open={historyDialog.open} onOpenChange={(o) => !o && setHistoryDialog({ open: false, slot: null, data: [] })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-indigo-600" />
              Timeline — {historyDialog.slot?.slot_code}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {historyDialog.data.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No assignments yet.</p>
            ) : (
              historyDialog.data.map((row) => (
                <div key={row.assignment_id} className={`p-3 rounded border ${row.end_date ? 'bg-gray-50 border-gray-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{row.user_name}</p>
                    {row.end_date ? (
                      <Badge className="bg-gray-200 text-gray-700 border-0 text-[10px]">Past</Badge>
                    ) : (
                      <Badge className="bg-emerald-200 text-emerald-800 border-0 text-[10px]">Current</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(row.start_date).toLocaleDateString()} —
                    {row.end_date ? ` ${new Date(row.end_date).toLocaleDateString()}` : ' present'}
                  </p>
                  {row.note && <p className="text-xs text-gray-600 italic mt-1">"{row.note}"</p>}
                  {row.assigned_by_name && <p className="text-[10px] text-gray-400 mt-0.5">Assigned by {row.assigned_by_name}</p>}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialog({ open: false, slot: null, data: [] })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${active ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  );
}
