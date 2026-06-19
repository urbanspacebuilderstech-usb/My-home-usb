/**
 * ExpenseSplitSection — Indirect Expense Split (Top + Sub Categories)
 * and the new 3-step multi-project Indirect Cost creation flow.
 *
 * Mounted inside `IndirectExpenseSection` (AccountsBoard.jsx) when the
 * user toggles to the "Expense Split" sub-tab. The multi-project Indirect
 * Cost dialog is also exported so the Expenses sub-tab can use it as the
 * replacement for the legacy single-category "Add Indirect Cost" dialog.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit, ChevronDown, ChevronRight, X, PieChart,
  Search, ArrowRight, CheckCircle, Layers,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Badge } from './ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtInr = (n) => {
  if (n === undefined || n === null) return '₹0';
  const v = Number(n) || 0;
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const COLOR_DOTS = {
  violet: 'bg-violet-500', rose: 'bg-rose-500', amber: 'bg-amber-500',
  emerald: 'bg-emerald-500', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
  pink: 'bg-pink-500', orange: 'bg-orange-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
};

// ============================================================================
// TOP CATEGORY DIALOG (create / edit)
// ============================================================================
function TopCategoryDialog({ open, onClose, existing, totalPercentageElsewhere, onSaved }) {
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name || '');
      setPercentage(existing ? String(existing.percentage) : '');
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const pct = parseFloat(percentage);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) { toast.error('Percentage must be 0-100'); return; }
    if (totalPercentageElsewhere + pct > 100.01) {
      toast.error(`Total would exceed 100% (other categories use ${totalPercentageElsewhere.toFixed(2)}%)`);
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await axios.patch(`${API}/expense-split/top-categories/${existing.top_category_id}`, { name: name.trim(), percentage: pct });
        toast.success('Top category updated');
      } else {
        await axios.post(`${API}/expense-split/top-categories`, { name: name.trim(), percentage: pct });
        toast.success('Top category created');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="top-category-dialog">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Top Category' : 'Add Top Category'}</DialogTitle>
          <DialogDescription>Splits the global Indirect Pool. All categories combined must be ≤ 100%.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Overhead, Marketing, ..." data-testid="top-category-name" />
          </div>
          <div>
            <Label>Percentage * <span className="text-[10px] text-gray-400 ml-2">Remaining: {(100 - totalPercentageElsewhere).toFixed(2)}%</span></Label>
            <Input type="number" min="0" max="100" step="0.01" value={percentage} onChange={(e) => setPercentage(e.target.value)} placeholder="e.g. 70" data-testid="top-category-percentage" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700" data-testid="top-category-save">{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// SUB CATEGORY DIALOG (create — no percentage)
// ============================================================================
function SubCategoryDialog({ open, onClose, topCategoryId, parentSubId, parentSubName, onSaved }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setName(''); }, [open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/expense-split/sub-categories`, {
        top_category_id: topCategoryId,
        parent_sub_category_id: parentSubId || null,
        name: name.trim(),
      });
      toast.success('Sub category created');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="sub-category-dialog">
        <DialogHeader>
          <DialogTitle>Add {parentSubId ? 'Sub-Sub' : 'Sub'} Category</DialogTitle>
          <DialogDescription>{parentSubName ? `Under "${parentSubName}"` : 'Free-form label (no percentage).'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salary, Travel, ..." data-testid="sub-category-name" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700" data-testid="sub-category-save">{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TOP CATEGORY ROW (with expandable sub-categories)
// ============================================================================
function TopCategoryRow({ cat, onEdit, onDelete, onAddSub, onDeleteSub, canManage }) {
  const [expanded, setExpanded] = useState(false);
  const [subs, setSubs] = useState([]);
  const [subSubs, setSubSubs] = useState({});  // { parentSubId: [...] }
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState({});

  const loadSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const res = await axios.get(`${API}/expense-split/sub-categories?top_category_id=${cat.top_category_id}`);
      const all = res.data || [];
      const tops = all.filter(s => !s.parent_sub_category_id);
      const childrenByParent = {};
      all.filter(s => s.parent_sub_category_id).forEach(s => {
        childrenByParent[s.parent_sub_category_id] = childrenByParent[s.parent_sub_category_id] || [];
        childrenByParent[s.parent_sub_category_id].push(s);
      });
      setSubs(tops);
      setSubSubs(childrenByParent);
    } catch {
      setSubs([]);
    } finally {
      setLoadingSubs(false);
    }
  }, [cat.top_category_id]);

  useEffect(() => { if (expanded) loadSubs(); }, [expanded, loadSubs]);

  const dot = COLOR_DOTS[cat.color] || 'bg-gray-400';

  return (
    <div className="border-b last:border-b-0" data-testid={`top-category-row-${cat.top_category_id}`}>
      <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-700" data-testid={`top-category-expand-${cat.top_category_id}`}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{cat.name}</p>
          <p className="text-[11px] text-gray-500">{cat.percentage}% of Indirect Pool • {cat.sub_count || 0} sub-categories</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase">Allocated</p>
          <p className="text-xs font-semibold text-violet-700">{fmtInr(cat.allocated_amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase">Spent</p>
          <p className="text-xs font-semibold text-red-600">{fmtInr(cat.spent_amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase">Balance</p>
          <p className={`text-xs font-semibold ${cat.balance >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmtInr(cat.balance)}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(cat)} className="p-1.5 rounded hover:bg-violet-100 text-violet-600" data-testid={`top-category-edit-${cat.top_category_id}`}><Edit className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDelete(cat)} className="p-1.5 rounded hover:bg-red-100 text-red-600" data-testid={`top-category-delete-${cat.top_category_id}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="bg-gray-50/50 px-8 py-2 space-y-1">
          {loadingSubs ? (
            <p className="text-[11px] text-gray-400 italic py-2">Loading...</p>
          ) : subs.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic py-2">No sub-categories yet.</p>
          ) : (
            subs.map(s => (
              <div key={s.sub_category_id}>
                <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white">
                  <button onClick={() => setExpandedSubs(prev => ({ ...prev, [s.sub_category_id]: !prev[s.sub_category_id] }))} className="text-gray-400 hover:text-gray-700">
                    {expandedSubs[s.sub_category_id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  <span className="text-xs text-gray-700 flex-1">{s.name}</span>
                  <span className="text-[10px] text-gray-400">{(subSubs[s.sub_category_id] || []).length} child</span>
                  {canManage && (
                    <>
                      <button onClick={() => onAddSub(cat.top_category_id, s.sub_category_id, s.name)} className="p-1 rounded hover:bg-violet-100 text-violet-600" title="Add sub-sub-category" data-testid={`add-sub-sub-${s.sub_category_id}`}><Plus className="h-3 w-3" /></button>
                      <button onClick={() => onDeleteSub(s)} className="p-1 rounded hover:bg-red-100 text-red-600"><Trash2 className="h-3 w-3" /></button>
                    </>
                  )}
                </div>
                {expandedSubs[s.sub_category_id] && (subSubs[s.sub_category_id] || []).map(ss => (
                  <div key={ss.sub_category_id} className="ml-8 flex items-center gap-2 py-1 px-2 rounded hover:bg-white">
                    <span className="text-[11px] text-gray-600 flex-1">↳ {ss.name}</span>
                    {canManage && (
                      <button onClick={() => onDeleteSub(ss)} className="p-1 rounded hover:bg-red-100 text-red-600"><Trash2 className="h-3 w-3" /></button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
          {canManage && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 mt-1" onClick={() => onAddSub(cat.top_category_id, null, null)} data-testid={`add-sub-${cat.top_category_id}`}>
              <Plus className="h-3 w-3" /> Add Sub Category
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN EXPENSE SPLIT SECTION
// ============================================================================
export function ExpenseSplitSection({ userRole }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topDialogOpen, setTopDialogOpen] = useState(false);
  const [editingTop, setEditingTop] = useState(null);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subDialogCtx, setSubDialogCtx] = useState({ top_category_id: null, parent_sub_category_id: null, parent_sub_name: null });

  const canManage = ['super_admin', 'accountant', 'general_manager'].includes(userRole);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/expense-split/top-categories`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteTop = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? This will also remove its sub-categories.`)) return;
    try {
      await axios.delete(`${API}/expense-split/top-categories/${cat.top_category_id}`);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const handleDeleteSub = async (sub) => {
    if (!window.confirm(`Delete sub-category "${sub.name}"?`)) return;
    try {
      await axios.delete(`${API}/expense-split/sub-categories/${sub.sub_category_id}`);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const editingTopId = editingTop?.top_category_id;
  const totalElsewhere = useMemo(() => {
    const cats = data?.categories || [];
    return cats.filter(c => c.top_category_id !== editingTopId).reduce((s, c) => s + (parseFloat(c.percentage) || 0), 0);
  }, [data, editingTopId]);

  const cats = data?.categories || [];

  return (
    <div className="space-y-3" data-testid="expense-split-section">
      {/* Summary mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-gray-500 uppercase">Indirect Pool</p>
            <p className="text-base font-bold text-emerald-700" data-testid="es-pool">{fmtInr(data?.indirect_pool_in)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-gray-500 uppercase">Allocated %</p>
            <p className={`text-base font-bold ${(data?.total_percentage || 0) > 100 ? 'text-red-600' : 'text-violet-700'}`} data-testid="es-allocated-pct">{(data?.total_percentage || 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-gray-500 uppercase">Allocated ₹</p>
            <p className="text-base font-bold text-blue-700" data-testid="es-allocated-rs">{fmtInr(data?.total_allocated)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-gray-500 uppercase">Spent ₹</p>
            <p className="text-base font-bold text-red-600" data-testid="es-spent-rs">{fmtInr(data?.total_spent)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-600" />
            <p className="text-sm font-semibold text-gray-800">Top Categories</p>
            <Badge variant="outline" className="text-[10px]">{cats.length}</Badge>
          </div>
          {canManage && (
            <Button size="sm" className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700" onClick={() => { setEditingTop(null); setTopDialogOpen(true); }} data-testid="add-top-category">
              <Plus className="h-3 w-3" /> Top Category
            </Button>
          )}
        </div>
        <div>
          {loading ? (
            <p className="text-xs text-gray-400 italic px-4 py-6 text-center">Loading...</p>
          ) : cats.length === 0 ? (
            <p className="text-xs text-gray-400 italic px-4 py-6 text-center">No top categories yet. Click <strong>+ Top Category</strong> to create your first.</p>
          ) : (
            cats.map(c => (
              <TopCategoryRow
                key={c.top_category_id}
                cat={c}
                onEdit={(cat) => { setEditingTop(cat); setTopDialogOpen(true); }}
                onDelete={handleDeleteTop}
                onAddSub={(tcId, parentSubId, parentSubName) => { setSubDialogCtx({ top_category_id: tcId, parent_sub_category_id: parentSubId, parent_sub_name: parentSubName }); setSubDialogOpen(true); }}
                onDeleteSub={handleDeleteSub}
                canManage={canManage}
              />
            ))
          )}
        </div>
      </Card>

      <TopCategoryDialog
        open={topDialogOpen}
        onClose={() => setTopDialogOpen(false)}
        existing={editingTop}
        totalPercentageElsewhere={totalElsewhere}
        onSaved={load}
      />
      <SubCategoryDialog
        open={subDialogOpen}
        onClose={() => setSubDialogOpen(false)}
        topCategoryId={subDialogCtx.top_category_id}
        parentSubId={subDialogCtx.parent_sub_category_id}
        parentSubName={subDialogCtx.parent_sub_name}
        onSaved={() => { setSubDialogOpen(false); load(); }}
      />
    </div>
  );
}

// ============================================================================
// MULTI-PROJECT INDIRECT COST DIALOG (3-step flow)
// ============================================================================
export function MultiProjectIndirectCostDialog({ open, onClose, onCreated }) {
  // Step 1 form
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [topCategoryId, setTopCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [subSubCategoryId, setSubSubCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('savings_account');
  const [vendorName, setVendorName] = useState('');

  // Loaded options
  const [topCats, setTopCats] = useState([]);
  const [subCats, setSubCats] = useState([]);
  const [subSubCats, setSubSubCats] = useState([]);

  // Step 2 — project picker
  const [step, setStep] = useState(1);
  const [projectsData, setProjectsData] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState({});  // {pid: true}

  // Step 3 — allocation
  const [allocations, setAllocations] = useState({}); // {pid: { amount, percent }}
  const [saving, setSaving] = useState(false);

  // ---- Reset on open ----
  useEffect(() => {
    if (open) {
      setStep(1);
      setAmount(''); setDescription(''); setTopCategoryId(''); setSubCategoryId(''); setSubSubCategoryId('');
      setPaymentMethod('savings_account'); setVendorName('');
      setSelectedProjectIds({}); setAllocations({}); setPickerSearch('');
      // Load top categories
      axios.get(`${API}/expense-split/top-categories`).then(r => setTopCats(r.data?.categories || [])).catch(() => setTopCats([]));
    }
  }, [open]);

  // ---- Cascade sub-cat loads ----
  useEffect(() => {
    setSubCategoryId(''); setSubSubCategoryId(''); setSubCats([]); setSubSubCats([]);
    if (topCategoryId) {
      axios.get(`${API}/expense-split/sub-categories?top_category_id=${topCategoryId}&parent_sub_category_id=`).then(r => {
        // backend filter expects null for top-level subs; without param it returns all → filter client-side
        const list = (r.data || []).filter(s => !s.parent_sub_category_id);
        setSubCats(list);
      }).catch(() => setSubCats([]));
    }
  }, [topCategoryId]);

  useEffect(() => {
    setSubSubCategoryId(''); setSubSubCats([]);
    if (subCategoryId) {
      axios.get(`${API}/expense-split/sub-categories?top_category_id=${topCategoryId}`).then(r => {
        setSubSubCats((r.data || []).filter(s => s.parent_sub_category_id === subCategoryId));
      }).catch(() => setSubSubCats([]));
    }
  }, [subCategoryId, topCategoryId]);

  // ---- Step 1 → Step 2 ----
  const goPickProjects = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!description.trim()) { toast.error('Description is required'); return; }
    if (!topCategoryId) { toast.error('Select a Top Category'); return; }
    try {
      const res = await axios.get(`${API}/indirect-costs/projects-balance`);
      setProjectsData(res.data);
      setStep(2);
    } catch {
      toast.error('Failed to load projects');
    }
  };

  const filteredProjects = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return (projectsData?.projects || []).filter(p => !q || (p.project_name || '').toLowerCase().includes(q));
  }, [projectsData, pickerSearch]);

  const selectedCount = Object.values(selectedProjectIds).filter(Boolean).length;

  // ---- Step 2 → Step 3 ----
  const goAllocate = () => {
    if (selectedCount === 0) { toast.error('Select at least one project'); return; }
    // Seed equal split
    const amt = parseFloat(amount);
    const pids = Object.keys(selectedProjectIds).filter(k => selectedProjectIds[k]);
    const equalPct = +(100 / pids.length).toFixed(4);
    const equalAmt = +(amt / pids.length).toFixed(2);
    const next = {};
    pids.forEach((pid, idx) => {
      // Distribute rounding error to last row
      if (idx === pids.length - 1) {
        const used = pids.slice(0, -1).reduce((s) => s + equalAmt, 0);
        next[pid] = { amount: +(amt - used).toFixed(2), percent: +(100 - equalPct * (pids.length - 1)).toFixed(4) };
      } else {
        next[pid] = { amount: equalAmt, percent: equalPct };
      }
    });
    setAllocations(next);
    setStep(3);
  };

  const updateAllocAmount = (pid, value) => {
    const amt = parseFloat(amount) || 0;
    const v = parseFloat(value) || 0;
    setAllocations(prev => ({
      ...prev,
      [pid]: { amount: v, percent: amt > 0 ? +((v / amt) * 100).toFixed(4) : 0 },
    }));
  };
  const updateAllocPct = (pid, value) => {
    const amt = parseFloat(amount) || 0;
    const v = parseFloat(value) || 0;
    setAllocations(prev => ({
      ...prev,
      [pid]: { percent: v, amount: +((v / 100) * amt).toFixed(2) },
    }));
  };

  const totalAllocated = Object.values(allocations).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const remaining = (parseFloat(amount) || 0) - totalAllocated;
  const totalPct = Object.values(allocations).reduce((s, a) => s + (parseFloat(a.percent) || 0), 0);
  const fullyAllocated = Math.abs(remaining) < 0.01 && Math.abs(totalPct - 100) < 0.01;

  // ---- Final submit ----
  const handleSubmit = async () => {
    if (!fullyAllocated) { toast.error('Allocation must total 100% of the expense amount'); return; }
    setSaving(true);
    try {
      const payload = {
        amount: parseFloat(amount),
        description: description.trim(),
        top_category_id: topCategoryId,
        sub_category_id: subCategoryId || null,
        sub_sub_category_id: subSubCategoryId || null,
        payment_method: paymentMethod,
        vendor_name: vendorName.trim() || null,
        allocations: Object.entries(allocations)
          .filter(([, v]) => parseFloat(v.amount) > 0)
          .map(([pid, v]) => ({ project_id: pid, amount: parseFloat(v.amount), percent: parseFloat(v.percent) })),
      };
      await axios.post(`${API}/indirect-costs/allocated`, payload);
      toast.success('Indirect cost allocated across projects');
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to record');
    } finally {
      setSaving(false);
    }
  };

  const selectedProjects = (projectsData?.projects || []).filter(p => selectedProjectIds[p.project_id]);

  // ============================================================================
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="multi-project-indirect-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 && <>Add Indirect Cost <Badge className="bg-violet-100 text-violet-700">Step 1 of 3 — Details</Badge></>}
            {step === 2 && <>Select Projects <Badge className="bg-violet-100 text-violet-700">Step 2 of 3</Badge></>}
            {step === 3 && <>Allocate Expense <Badge className="bg-violet-100 text-violet-700">Step 3 of 3</Badge></>}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1 — Details */}
        {step === 1 && (
          <div className="space-y-3" data-testid="step1-details">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Expense Amount *</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500000" data-testid="step1-amount" />
              </div>
              <div>
                <Label>Vendor / Payee</Label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Optional" data-testid="step1-vendor" />
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. June salary disbursement" data-testid="step1-description" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Top Category *</Label>
                <Select value={topCategoryId} onValueChange={setTopCategoryId}>
                  <SelectTrigger data-testid="step1-top-category"><SelectValue placeholder="Pick..." /></SelectTrigger>
                  <SelectContent>
                    {topCats.map(c => <SelectItem key={c.top_category_id} value={c.top_category_id}>{c.name} ({c.percentage}%)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub Category</Label>
                <Select value={subCategoryId} onValueChange={setSubCategoryId} disabled={!topCategoryId || subCats.length === 0}>
                  <SelectTrigger data-testid="step1-sub-category"><SelectValue placeholder={subCats.length === 0 ? 'None' : 'Pick...'} /></SelectTrigger>
                  <SelectContent>
                    {subCats.map(s => <SelectItem key={s.sub_category_id} value={s.sub_category_id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-Sub Category</Label>
                <Select value={subSubCategoryId} onValueChange={setSubSubCategoryId} disabled={!subCategoryId || subSubCats.length === 0}>
                  <SelectTrigger data-testid="step1-sub-sub-category"><SelectValue placeholder={subSubCats.length === 0 ? 'None' : 'Pick...'} /></SelectTrigger>
                  <SelectContent>
                    {subSubCats.map(s => <SelectItem key={s.sub_category_id} value={s.sub_category_id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="step1-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings_account">HDFC SAVINGS</SelectItem>
                  <SelectItem value="current_account">HDFC CURRENT</SelectItem>
                  <SelectItem value="direct_transfer">CASH D/T</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="escrow">Escrow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* STEP 2 — Project Picker */}
        {step === 2 && (
          <div className="space-y-2" data-testid="step2-projects">
            <Card className="bg-violet-50 border-violet-200">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-violet-700 uppercase">Expense Amount</p>
                  <p className="text-base font-bold text-violet-700">{fmtInr(parseFloat(amount))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 uppercase">Selected</p>
                  <p className="text-base font-bold text-violet-700">{selectedCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 uppercase">Pool Available</p>
                  <p className="text-base font-bold text-emerald-700">{fmtInr(projectsData?.total_balance)}</p>
                </div>
              </CardContent>
            </Card>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input type="text" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search project..." className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500" data-testid="step2-search" />
            </div>
            <div className="border rounded-md max-h-80 overflow-y-auto" data-testid="step2-project-list">
              {filteredProjects.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-4 py-8 text-center">No projects found.</p>
              ) : (
                filteredProjects.map(p => (
                  <label key={p.project_id} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-violet-50 cursor-pointer">
                    <input type="checkbox" checked={!!selectedProjectIds[p.project_id]} onChange={(e) => setSelectedProjectIds(prev => ({ ...prev, [p.project_id]: e.target.checked }))} className="h-3.5 w-3.5 accent-violet-600" data-testid={`step2-checkbox-${p.project_id}`} />
                    <span className="text-xs flex-1 text-gray-700 truncate">{p.project_name || '(Unnamed)'}</span>
                    <span className="text-[11px] text-gray-500">IDC: <span className="font-semibold text-emerald-700">{fmtInr(p.balance)}</span></span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        {/* STEP 3 — Allocation */}
        {step === 3 && (
          <div className="space-y-2" data-testid="step3-allocate">
            <Card className="bg-violet-50 border-violet-200">
              <CardContent className="p-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-violet-700 uppercase">Expense Amount</p>
                  <p className="text-base font-bold text-violet-700">{fmtInr(parseFloat(amount))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 uppercase">Allocated</p>
                  <p className="text-base font-bold text-blue-700">{fmtInr(totalAllocated)} • {totalPct.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-violet-700 uppercase">Remaining</p>
                  <p className={`text-base font-bold ${Math.abs(remaining) < 0.01 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtInr(remaining)}</p>
                </div>
              </CardContent>
            </Card>
            <div className="border rounded-md max-h-80 overflow-y-auto" data-testid="step3-table">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Project</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">IDC</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">%</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Amount</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProjects.map(p => {
                    const a = allocations[p.project_id] || { amount: 0, percent: 0 };
                    const balanceAfter = (p.balance || 0) - (parseFloat(a.amount) || 0);
                    return (
                      <tr key={p.project_id} className="border-b">
                        <td className="px-3 py-2 text-gray-700">{p.project_name}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{fmtInr(p.balance)}</td>
                        <td className="px-3 py-2 text-right w-20">
                          <input type="number" step="0.01" value={a.percent || ''} onChange={(e) => updateAllocPct(p.project_id, e.target.value)} className="w-full text-right border rounded px-1 py-0.5 text-xs" data-testid={`step3-pct-${p.project_id}`} />
                        </td>
                        <td className="px-3 py-2 text-right w-32">
                          <input type="number" step="0.01" value={a.amount || ''} onChange={(e) => updateAllocAmount(p.project_id, e.target.value)} className="w-full text-right border rounded px-1 py-0.5 text-xs" data-testid={`step3-amt-${p.project_id}`} />
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${balanceAfter < 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmtInr(balanceAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)} data-testid="step-back">Back</Button>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === 1 && <Button onClick={goPickProjects} className="bg-violet-600 hover:bg-violet-700 gap-1" data-testid="step1-next">Select Projects <ArrowRight className="h-3.5 w-3.5" /></Button>}
          {step === 2 && <Button onClick={goAllocate} disabled={selectedCount === 0} className="bg-violet-600 hover:bg-violet-700 gap-1" data-testid="step2-next">Allocation <ArrowRight className="h-3.5 w-3.5" /></Button>}
          {step === 3 && <Button onClick={handleSubmit} disabled={!fullyAllocated || saving} className="bg-emerald-600 hover:bg-emerald-700 gap-1" data-testid="step3-submit"><CheckCircle className="h-3.5 w-3.5" /> {saving ? 'Recording...' : 'Allocate & Record'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExpenseSplitSection;
