import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Search, Building2, Phone, Mail, MapPin, Edit, Trash2, ChevronDown, Check, FileText, History, Loader2, Copy } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

const CATEGORY_LABELS = {
  sub_contractor: 'Sub-contractor',
  consultant: 'Consultant',
  statutory: 'Statutory',
  misc: 'Misc',
};
const labelOf = (key) => CATEGORY_LABELS[key] || (key || 'Misc').replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase());

const emptyForm = {
  name: '',
  category: 'sub_contractor',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  bank_name: '',
  account_number: '',
  ifsc_code: '',
  branch: '',
  upi_id: '',
  gst_number: '',
  pan_number: '',
  notes: '',
};

export default function OtherAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState(['sub_contractor', 'consultant', 'statutory', 'misc']);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailDialog, setDetailDialog] = useState({ open: false, account: null, history: [] });

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/other-accounts`);
      setAccounts(r.data.accounts || []);
      setCategories(r.data.categories || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, category: filterCat !== 'all' ? filterCat : 'sub_contractor' });
    setDialogOpen(true);
  };
  const openEdit = (acc) => {
    setEditing(acc);
    setForm({ ...emptyForm, ...acc });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      if (editing) {
        await axios.patch(`${API}/other-accounts/${editing.account_id}`, form);
        toast.success('Account updated');
      } else {
        await axios.post(`${API}/other-accounts`, form);
        toast.success('Account created');
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (acc) => {
    if (!window.confirm(`Deactivate "${acc.name}"?`)) return;
    try {
      await axios.delete(`${API}/other-accounts/${acc.account_id}`);
      toast.success('Deactivated');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const openDetail = async (acc) => {
    try {
      const r = await axios.get(`${API}/other-accounts/${acc.account_id}`);
      setDetailDialog({ open: true, account: r.data.account, history: r.data.history || [] });
    } catch (e) { toast.error('Failed to load'); }
  };

  const filtered = useMemo(() => {
    let res = accounts.filter(a => a.is_active !== false);
    if (filterCat !== 'all') res = res.filter(a => a.category === filterCat);
    const q = search.trim().toLowerCase();
    if (q) res = res.filter(a =>
      (a.name || '').toLowerCase().includes(q)
      || (a.bank_name || '').toLowerCase().includes(q)
      || (a.account_number || '').toLowerCase().includes(q)
      || (a.contact_person || '').toLowerCase().includes(q)
    );
    return res;
  }, [accounts, filterCat, search]);

  const counts = useMemo(() => {
    const c = { all: 0 };
    for (const a of accounts) {
      if (a.is_active === false) continue;
      c.all += 1;
      c[a.category] = (c[a.category] || 0) + 1;
    }
    return c;
  }, [accounts]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-emerald-600" /> Other Accounts
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Sub-contractors, consultants, statutory & misc payees with bank details for Direct Transfer</p>
          </div>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-1" data-testid="oa-add-btn">
            <Plus className="h-4 w-4" /> Add New Account
          </Button>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2" data-testid="oa-category-pills">
          <CategoryPill label="All" count={counts.all || 0} active={filterCat === 'all'} onClick={() => setFilterCat('all')} testId="oa-pill-all" />
          {categories.map(cat => (
            <CategoryPill
              key={cat}
              label={labelOf(cat)}
              count={counts[cat] || 0}
              active={filterCat === cat}
              onClick={() => setFilterCat(cat)}
              testId={`oa-pill-${cat}`}
            />
          ))}
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-3">
            <div className="relative max-w-md">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search by name, bank, A/c number, contact…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
                data-testid="oa-search"
              />
            </div>
          </CardContent>
        </Card>

        {/* Account grid */}
        {loading ? (
          <div className="py-16 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              No accounts found. Click <span className="font-semibold text-emerald-600">Add New Account</span> to create one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="oa-grid">
            {filtered.map(acc => (
              <Card key={acc.account_id} className="hover:shadow-md transition-shadow cursor-pointer" data-testid={`oa-card-${acc.account_id}`}>
                <CardContent className="p-4 space-y-2" onClick={() => openDetail(acc)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{acc.name}</p>
                      <Badge className="bg-emerald-50 text-emerald-700 text-[10px] mt-1">{labelOf(acc.category)}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(acc); }} data-testid={`oa-edit-${acc.account_id}`}><Edit className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={(e) => { e.stopPropagation(); remove(acc); }} data-testid={`oa-delete-${acc.account_id}`}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-gray-600">
                    {acc.contact_person && <p className="flex items-center gap-1.5"><span className="text-gray-400">Contact:</span> {acc.contact_person}</p>}
                    {acc.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-gray-400" /> {acc.phone}</p>}
                    {acc.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-gray-400" /> {acc.email}</p>}
                    {acc.bank_name && <p className="flex items-center gap-1.5"><Building2 className="h-3 w-3 text-gray-400" /> {acc.bank_name} {acc.account_number ? `· ${acc.account_number}` : ''}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Account' : 'Add New Account'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Krishna Plumbing" data-testid="oa-form-name" />
              </div>
              <div>
                <Label className="text-xs">Category *</Label>
                <CategoryCombo
                  value={form.category}
                  options={categories}
                  onChange={(v) => setForm({ ...form, category: v })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Contact Person</Label>
              <Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">UPI ID</Label>
              <Input value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} placeholder="user@bank" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2 border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-gray-700 mb-2">Bank Details</p>
            </div>
            <div>
              <Label className="text-xs">Bank Name</Label>
              <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Branch</Label>
              <Input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Account Number</Label>
              <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">IFSC</Label>
              <Input value={form.ifsc_code} onChange={e => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label className="text-xs">GST</Label>
              <Input value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">PAN</Label>
              <Input value={form.pan_number} onChange={e => setForm({ ...form, pan_number: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700" data-testid="oa-form-submit">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : (editing ? 'Save Changes' : 'Create Account')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog (Bank Details / History) */}
      <Dialog open={detailDialog.open} onOpenChange={(o) => !o && setDetailDialog({ open: false, account: null, history: [] })}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailDialog.account && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                  {detailDialog.account.name}
                  <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">{labelOf(detailDialog.account.category)}</Badge>
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="bank">
                <TabsList>
                  <TabsTrigger value="bank" data-testid="oa-detail-tab-bank"><FileText className="h-3 w-3 mr-1" /> Bank Details</TabsTrigger>
                  <TabsTrigger value="history" data-testid="oa-detail-tab-history"><History className="h-3 w-3 mr-1" /> Payment History</TabsTrigger>
                </TabsList>
                <TabsContent value="bank">
                  <BankDetailsView account={detailDialog.account} />
                </TabsContent>
                <TabsContent value="history">
                  <HistoryView history={detailDialog.history} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryPill({ label, count, active, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${active ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-1 ring-emerald-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
      data-testid={testId}
    >
      {label} <Badge className={`${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'} h-4 text-[10px] px-1.5`}>{count}</Badge>
    </button>
  );
}

function CategoryCombo({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  const exact = options.some(o => o === query.trim().toLowerCase().replace(/\s+/g, '_'));
  const canCreate = query.trim().length > 0 && !exact;
  const choose = (v) => { onChange(v); setOpen(false); setQuery(''); };
  const create = () => choose(query.trim().toLowerCase().replace(/\s+/g, '_'));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full h-9 justify-between text-xs font-normal" data-testid="oa-category-combo">
          <span className="truncate text-left flex-1">{labelOf(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            autoFocus
            placeholder="Type to search or add new…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-8 text-xs"
            data-testid="oa-category-input"
          />
        </div>
        <div className="max-h-56 overflow-auto py-1">
          {canCreate && (
            <button
              type="button"
              onClick={create}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-emerald-50 text-emerald-700 font-medium"
              data-testid="oa-category-create"
            >
              <Plus className="h-3.5 w-3.5" /> Create &quot;{labelOf(query.trim().toLowerCase().replace(/\s+/g, '_'))}&quot;
            </button>
          )}
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => choose(o)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${value === o ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'}`}
              data-testid={`oa-category-opt-${o}`}
            >
              <Check className={`h-3.5 w-3.5 ${value === o ? 'opacity-100' : 'opacity-0'}`} />
              {labelOf(o)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BankDetailsView({ account }) {
  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success('Copied to clipboard');
  };
  const whatsappText = [
    `*${account.name}*`,
    account.bank_name && `Bank: ${account.bank_name}`,
    account.branch && `Branch: ${account.branch}`,
    account.account_number && `A/c: ${account.account_number}`,
    account.ifsc_code && `IFSC: ${account.ifsc_code}`,
    account.upi_id && `UPI: ${account.upi_id}`,
  ].filter(Boolean).join('\n');
  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          ['Bank Name', account.bank_name],
          ['Branch', account.branch],
          ['Account Number', account.account_number],
          ['IFSC', account.ifsc_code],
          ['UPI ID', account.upi_id],
          ['GST', account.gst_number],
          ['PAN', account.pan_number],
          ['Phone', account.phone],
          ['Email', account.email],
          ['Address', account.address],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="bg-gray-50 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase">{k}</p>
            <p className="font-medium text-sm flex items-center gap-1">
              {v}
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => copy(v)}>
                <Copy className="h-3 w-3" />
              </Button>
            </p>
          </div>
        ))}
      </div>
      {whatsappText && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-emerald-700">WhatsApp-ready message</p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copy(whatsappText)} data-testid="oa-copy-whatsapp">
              <Copy className="h-3 w-3" /> Copy
            </Button>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-sans text-gray-700">{whatsappText}</pre>
        </div>
      )}
    </div>
  );
}

function HistoryView({ history }) {
  if (!history || history.length === 0) {
    return <div className="py-8 text-center text-gray-400 text-sm">No payment history yet</div>;
  }
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={h.expense_id || i} className="border-b">
              <td className="px-3 py-2">{h.created_at ? new Date(h.created_at).toLocaleDateString('en-IN') : '-'}</td>
              <td className="px-3 py-2">{h.description || '-'}</td>
              <td className="px-3 py-2"><Badge className="bg-gray-100 text-gray-700 text-[10px]">{(h.payment_method || '').replace(/_/g, ' ')}</Badge></td>
              <td className="px-3 py-2 text-right font-bold">{fmt(h.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
