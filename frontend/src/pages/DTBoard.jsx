import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ArrowRightLeft, Copy, Loader2, CheckCircle2, Package, Users, Building2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

const STATUS_BADGE = {
  pending_cre_recv: { label: 'Mark Received', cls: 'bg-blue-100 text-blue-700' },
  pending_accountant_review: { label: 'In Review', cls: 'bg-purple-100 text-purple-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
};

function buildBankText(it) {
  const b = it.bank || {};
  const lines = [
    `*${it.title || ''}*${it.vendor_name ? ' — ' + it.vendor_name : ''}${it.contractor_name ? ' — ' + it.contractor_name : ''}`,
    `Amount: ${fmt(it.amount)}`,
    b.bank_name && `Bank: ${b.bank_name}`,
    b.branch && `Branch: ${b.branch}`,
    b.account_number && `A/c: ${b.account_number}`,
    b.ifsc_code && `IFSC: ${b.ifsc_code}`,
    b.upi_id && `UPI: ${b.upi_id}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export default function DTBoard() {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null); // selected DT
  const [recv, setRecv] = useState({}); // index → received_amount
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('material');

  const load = async () => {
    setLoading(true);
    try {
      // Reuse cashbook to fetch incomes (DT only)
      const r = await axios.get(`${API}/accountant/cashbook-filtered`);
      const items = (r.data?.income_entries || []).filter(e => e.payment_mode === 'direct_transfer' && e.dt_status);
      setList(items);
    } catch (e) {
      toast.error('Failed to load DT requests');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (dt) => {
    try {
      const r = await axios.get(`${API}/dt/${dt.income_id}`);
      setActive(r.data);
      const init = {};
      (r.data.dt_items || []).forEach((it, i) => { init[i] = it.received_amount || 0; });
      setRecv(init);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load');
    }
  };

  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success('Copied');
  };

  const submit = async () => {
    if (!active) return;
    const receipts = Object.entries(recv).map(([k, v]) => ({ index: Number(k), received_amount: Number(v) }));
    setSubmitting(true);
    try {
      await axios.post(`${API}/dt/${active.income_id}/receive`, { receipts });
      toast.success('Submitted for Accountant review');
      setActive(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const items = active?.dt_items || [];
  const grouped = useMemo(() => ({
    material: items.map((it, idx) => ({ ...it, idx })).filter(x => x.kind === 'material'),
    labour: items.map((it, idx) => ({ ...it, idx })).filter(x => x.kind === 'labour'),
    other: items.map((it, idx) => ({ ...it, idx })).filter(x => x.kind === 'other_account'),
  }), [items]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-emerald-600" /> Direct Transfer Requests
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">DTs assigned by Accountant — verify bank details, copy & forward, mark amount received, submit for approval.</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-gray-400">No DTs assigned yet.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Project</th>
                    <th className="text-right px-3 py-2 font-semibold">Amount</th>
                    <th className="text-center px-3 py-2 font-semibold">Items</th>
                    <th className="text-center px-3 py-2 font-semibold">Status</th>
                    <th className="text-center px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(dt => {
                    const sb = STATUS_BADGE[dt.dt_status] || { label: dt.dt_status || 'New', cls: 'bg-amber-100 text-amber-700' };
                    return (
                      <tr key={dt.income_id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">{new Date(dt.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2 font-medium">{dt.project_name || '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(dt.amount)}</td>
                        <td className="px-3 py-2 text-center">{(dt.dt_items || []).length}</td>
                        <td className="px-3 py-2 text-center"><Badge className={`${sb.cls} text-[10px]`}>{sb.label}</Badge></td>
                        <td className="px-3 py-2 text-center">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDetail(dt)} data-testid={`dt-open-${dt.income_id}`}>Open</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-emerald-600" />
                  DT · {fmt(active.amount)} · {active.project_name || ''}
                  <Badge className={`text-[10px] ${(STATUS_BADGE[active.dt_status] || {cls:''}).cls}`}>{(STATUS_BADGE[active.dt_status] || {label:active.dt_status}).label}</Badge>
                </DialogTitle>
              </DialogHeader>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="material" data-testid="dt-cre-tab-material"><Package className="h-3 w-3 mr-1" /> Material <Badge className="ml-1 bg-blue-100 text-blue-700 text-[10px]">{grouped.material.length}</Badge></TabsTrigger>
                  <TabsTrigger value="labour" data-testid="dt-cre-tab-labour"><Users className="h-3 w-3 mr-1" /> Labour <Badge className="ml-1 bg-amber-100 text-amber-700 text-[10px]">{grouped.labour.length}</Badge></TabsTrigger>
                  <TabsTrigger value="other" data-testid="dt-cre-tab-other"><Building2 className="h-3 w-3 mr-1" /> Other <Badge className="ml-1 bg-emerald-100 text-emerald-700 text-[10px]">{grouped.other.length}</Badge></TabsTrigger>
                </TabsList>
                {['material', 'labour', 'other'].map(k => (
                  <TabsContent key={k} value={k}>
                    {grouped[k].length === 0 ? (
                      <div className="py-8 text-center text-gray-400 text-sm">No items in this group</div>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {grouped[k].map(it => {
                          const txt = buildBankText(it);
                          return (
                            <Card key={it.idx}>
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{it.title}</p>
                                    <p className="text-[11px] text-gray-500">{it.vendor_name || it.contractor_name || (it.category || '').replace(/_/g, ' ')}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] text-gray-500 uppercase">Amount</p>
                                    <p className="font-bold text-emerald-700">{fmt(it.amount)}</p>
                                  </div>
                                </div>
                                {it.bank ? (
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                    {[
                                      ['Bank', it.bank.bank_name],
                                      ['Branch', it.bank.branch],
                                      ['A/c', it.bank.account_number],
                                      ['IFSC', it.bank.ifsc_code],
                                      ['UPI', it.bank.upi_id],
                                    ].filter(([, v]) => v).map(([lbl, v]) => (
                                      <div key={lbl} className="bg-gray-50 rounded px-2 py-1 flex items-center justify-between">
                                        <span><span className="text-gray-400">{lbl}:</span> <span className="font-medium">{v}</span></span>
                                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copy(v)}><Copy className="h-3 w-3" /></Button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-amber-600 mt-2 italic">No bank details on record</p>
                                )}

                                <div className="mt-2 flex items-center gap-2">
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copy(txt)} data-testid={`dt-copy-${it.idx}`}>
                                    <Copy className="h-3 w-3" /> Copy WhatsApp text
                                  </Button>
                                </div>

                                <div className="mt-2 flex items-center gap-2">
                                  <span className="text-[11px] text-gray-500">Received Amount</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={recv[it.idx] || ''}
                                    onChange={e => setRecv({ ...recv, [it.idx]: Number(e.target.value) || 0 })}
                                    className="h-7 text-xs w-32"
                                    placeholder="0"
                                    disabled={active.dt_status !== 'pending_cre_recv'}
                                    data-testid={`dt-recv-${it.idx}`}
                                  />
                                  <span className={`text-[10px] ${recv[it.idx] >= it.amount ? 'text-green-600' : 'text-amber-600'}`}>
                                    of {fmt(it.amount)}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>

              <DialogFooter>
                <Button variant="outline" onClick={() => setActive(null)}>Close</Button>
                {active.dt_status === 'pending_cre_recv' && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting} data-testid="dt-cre-submit">
                    {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting…</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Submit to Accountant</>}
                  </Button>
                )}
                {active.dt_status === 'pending_accountant_review' && (
                  <Button
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={async () => {
                      try {
                        await axios.post(`${API}/dt/${active.income_id}/approve`);
                        toast.success('DT cycle completed');
                        setActive(null); load();
                      } catch (e) {
                        toast.error(e?.response?.data?.detail || 'Approve failed');
                      }
                    }}
                    data-testid="dt-acc-approve"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve & Close (Accountant)
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
