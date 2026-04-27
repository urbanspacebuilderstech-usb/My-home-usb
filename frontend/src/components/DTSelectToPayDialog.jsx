import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Loader2, Search, Package, Users, Building2, ArrowRightLeft, CheckCircle2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

const matAmount = (m) => Number(m.final_amount || m.estimated_cost || m.estimated_price || 0);
const matTitle = (m) => m.material_name || m.description || 'Material';
const labAmount = (l) => Number(l.total_amount || l.amount || 0);
const labTitle = (l) => l.labour_type || l.description || l.contractor_name || 'Labour';

/**
 * Accountant: Select active payable items (material/labour/other-accounts) against a DT income.
 * Multi-select across tabs, can exceed DT amount (chunked payments).
 */
export default function DTSelectToPayDialog({ open, onOpenChange, dtIncome, onAssigned }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState({ material_requests: [], labour_requests: [], other_accounts: [] });
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('material');
  // selections: { material: { id: amount }, labour: { id: amount }, other: { id: amount } }
  const [sel, setSel] = useState({ material: {}, labour: {}, other: {} });

  useEffect(() => {
    if (!open) return;
    setSel({ material: {}, labour: {}, other: {} });
    setSearch('');
    setTab('material');
    setLoading(true);
    axios.get(`${API}/dt/payable-items`)
      .then(r => setItems(r.data))
      .catch(e => toast.error(e?.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [open]);

  const dtAmount = Number(dtIncome?.amount || 0);

  const matchSearch = (txt) => !search.trim() || (txt || '').toLowerCase().includes(search.trim().toLowerCase());
  const fMaterial = useMemo(() => (items.material_requests || []).filter(m => matchSearch(`${matTitle(m)} ${m.vendor_name || ''} ${m.project_name || ''}`)), [items, search]);
  const fLabour = useMemo(() => (items.labour_requests || []).filter(l => matchSearch(`${labTitle(l)} ${l.contractor_name || ''} ${l.project_name || ''}`)), [items, search]);
  const fOther = useMemo(() => (items.other_accounts || []).filter(o => matchSearch(`${o.name} ${o.bank_name || ''} ${o.category || ''}`)), [items, search]);

  const toggleMat = (m) => {
    setSel(prev => {
      const cp = { ...prev.material };
      if (cp[m.expense_id] != null) delete cp[m.expense_id];
      else cp[m.expense_id] = matAmount(m);
      return { ...prev, material: cp };
    });
  };
  const toggleLab = (l) => {
    setSel(prev => {
      const id = l.labour_expense_id || l.expense_id;
      const cp = { ...prev.labour };
      if (cp[id] != null) delete cp[id];
      else cp[id] = labAmount(l);
      return { ...prev, labour: cp };
    });
  };
  const toggleOther = (o) => {
    setSel(prev => {
      const cp = { ...prev.other };
      if (cp[o.account_id] != null) delete cp[o.account_id];
      else cp[o.account_id] = 0; // user enters amount
      return { ...prev, other: cp };
    });
  };
  const setOtherAmt = (id, v) => {
    setSel(prev => ({ ...prev, other: { ...prev.other, [id]: Number(v) || 0 } }));
  };

  const totalSelected = useMemo(() => {
    const m = Object.values(sel.material).reduce((s, v) => s + Number(v || 0), 0);
    const l = Object.values(sel.labour).reduce((s, v) => s + Number(v || 0), 0);
    const o = Object.values(sel.other).reduce((s, v) => s + Number(v || 0), 0);
    return m + l + o;
  }, [sel]);

  const counts = {
    material: Object.keys(sel.material).length,
    labour: Object.keys(sel.labour).length,
    other: Object.keys(sel.other).length,
  };
  const totalCount = counts.material + counts.labour + counts.other;

  const submit = async () => {
    const selections = [];
    Object.entries(sel.material).forEach(([id, amt]) => selections.push({ kind: 'material', request_id: id, amount: Number(amt) }));
    Object.entries(sel.labour).forEach(([id, amt]) => selections.push({ kind: 'labour', request_id: id, amount: Number(amt) }));
    Object.entries(sel.other).forEach(([id, amt]) => {
      if (Number(amt) > 0) selections.push({ kind: 'other_account', other_account_id: id, amount: Number(amt) });
    });
    if (selections.length === 0) {
      toast.error('Select at least one item with amount');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/dt/${dtIncome.income_id}/assign`, { selections });
      toast.success(`Assigned ${selections.length} items to DT — sent to CRE for receipt.`);
      onAssigned && onAssigned();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Assign failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-emerald-600" /> Select to Pay against DT
          </DialogTitle>
        </DialogHeader>
        {dtIncome && (
          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-[10px] text-emerald-700 uppercase">DT Amount</p><p className="font-bold text-emerald-700 text-base">{fmt(dtAmount)}</p></div>
            <div><p className="text-[10px] text-emerald-700 uppercase">Selected Total</p><p className={`font-bold text-base ${totalSelected > dtAmount ? 'text-amber-700' : 'text-blue-700'}`}>{fmt(totalSelected)}{totalSelected > dtAmount && <span className="text-[10px] ml-1 text-amber-600">(exceeds)</span>}</p></div>
            <div><p className="text-[10px] text-emerald-700 uppercase">Items</p><p className="font-bold text-base">{totalCount}</p></div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Search by name, vendor/contractor, project, bank…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-xs" data-testid="dt-search" />
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="material" data-testid="dt-tab-material"><Package className="h-3 w-3 mr-1" /> Material Vendors <Badge className="ml-1 bg-blue-100 text-blue-700 text-[10px]">{counts.material}/{fMaterial.length}</Badge></TabsTrigger>
              <TabsTrigger value="labour" data-testid="dt-tab-labour"><Users className="h-3 w-3 mr-1" /> Labour Contractors <Badge className="ml-1 bg-amber-100 text-amber-700 text-[10px]">{counts.labour}/{fLabour.length}</Badge></TabsTrigger>
              <TabsTrigger value="other" data-testid="dt-tab-other"><Building2 className="h-3 w-3 mr-1" /> Other Accounts <Badge className="ml-1 bg-emerald-100 text-emerald-700 text-[10px]">{counts.other}/{fOther.length}</Badge></TabsTrigger>
            </TabsList>

            <TabsContent value="material">
              <Card>
                <CardContent className="p-0">
                  {fMaterial.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No active material requests</div>
                  ) : (
                    <table className="w-full text-xs" data-testid="dt-material-table">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Project</th>
                          <th className="text-left px-3 py-2 font-semibold">Material</th>
                          <th className="text-left px-3 py-2 font-semibold">Vendor</th>
                          <th className="text-right px-3 py-2 font-semibold">Amount</th>
                          <th className="text-center px-3 py-2 font-semibold">Select</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fMaterial.map(m => {
                          const checked = sel.material[m.expense_id] != null;
                          return (
                            <tr key={m.expense_id} onClick={() => toggleMat(m)} className={`border-b cursor-pointer ${checked ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-3 py-2">{m.project_name}</td>
                              <td className="px-3 py-2 font-medium">{matTitle(m)}</td>
                              <td className="px-3 py-2">{m.vendor_name || m.supplier_name || '—'}</td>
                              <td className="px-3 py-2 text-right font-bold text-blue-700">{fmt(matAmount(m))}</td>
                              <td className="px-3 py-2 text-center"><input type="checkbox" checked={checked} onChange={() => toggleMat(m)} onClick={e => e.stopPropagation()} className="h-4 w-4 accent-emerald-600" data-testid={`dt-mat-cb-${m.expense_id}`} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="labour">
              <Card>
                <CardContent className="p-0">
                  {fLabour.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No active labour requests</div>
                  ) : (
                    <table className="w-full text-xs" data-testid="dt-labour-table">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Project</th>
                          <th className="text-left px-3 py-2 font-semibold">Type</th>
                          <th className="text-left px-3 py-2 font-semibold">Contractor</th>
                          <th className="text-right px-3 py-2 font-semibold">Amount</th>
                          <th className="text-center px-3 py-2 font-semibold">Select</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fLabour.map(l => {
                          const id = l.labour_expense_id || l.expense_id;
                          const checked = sel.labour[id] != null;
                          return (
                            <tr key={id} onClick={() => toggleLab(l)} className={`border-b cursor-pointer ${checked ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-3 py-2">{l.project_name}</td>
                              <td className="px-3 py-2 font-medium">{labTitle(l)}</td>
                              <td className="px-3 py-2">{l.contractor_name || '—'}</td>
                              <td className="px-3 py-2 text-right font-bold text-amber-700">{fmt(labAmount(l))}</td>
                              <td className="px-3 py-2 text-center"><input type="checkbox" checked={checked} onChange={() => toggleLab(l)} onClick={e => e.stopPropagation()} className="h-4 w-4 accent-emerald-600" data-testid={`dt-lab-cb-${id}`} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="other">
              <Card>
                <CardContent className="p-0">
                  {fOther.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No other accounts. Add via Other Accounts menu.</div>
                  ) : (
                    <table className="w-full text-xs" data-testid="dt-other-table">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Name</th>
                          <th className="text-left px-3 py-2 font-semibold">Category</th>
                          <th className="text-left px-3 py-2 font-semibold">Bank</th>
                          <th className="text-left px-3 py-2 font-semibold w-32">Amount *</th>
                          <th className="text-center px-3 py-2 font-semibold">Select</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fOther.map(o => {
                          const checked = sel.other[o.account_id] != null;
                          return (
                            <tr key={o.account_id} className={`border-b ${checked ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-3 py-2 font-medium">{o.name}</td>
                              <td className="px-3 py-2"><Badge className="bg-gray-100 text-gray-700 text-[10px]">{(o.category || 'misc').replace(/_/g, ' ')}</Badge></td>
                              <td className="px-3 py-2 text-[11px] text-gray-600">{o.bank_name ? `${o.bank_name} · ${o.account_number || ''}` : '—'}</td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min="0"
                                  disabled={!checked}
                                  value={sel.other[o.account_id] || ''}
                                  onChange={e => setOtherAmt(o.account_id, e.target.value)}
                                  className="h-7 text-xs"
                                  data-testid={`dt-other-amt-${o.account_id}`}
                                />
                              </td>
                              <td className="px-3 py-2 text-center"><input type="checkbox" checked={checked} onChange={() => toggleOther(o)} className="h-4 w-4 accent-emerald-600" data-testid={`dt-other-cb-${o.account_id}`} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || totalCount === 0} className="bg-emerald-600 hover:bg-emerald-700" data-testid="dt-submit-assign">
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting…</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Submit · {fmt(totalSelected)} ({totalCount} items)</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
