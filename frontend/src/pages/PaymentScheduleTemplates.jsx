// Payment Schedule Templates — manage reusable schedules (Planning / Super Admin)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit2, Save, ArrowLeft, FileText, Copy } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PaymentScheduleTemplates() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = new, else existing template
  const [form, setForm] = useState({ template_name: '', description: '', rows: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await axios.get(`${API}/auth/me`);
        const role = me.data?.role;
        if (!['super_admin', 'planning'].includes(role)) {
          toast.error('You do not have permission'); navigate('/dashboard'); return;
        }
        setUser(me.data);
        await fetchTemplates();
      } catch { navigate('/login'); }
      setLoading(false);
    })();
    /* eslint-disable-next-line */
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API}/payment-schedule-templates`);
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (e) { toast.error('Failed to load templates'); }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ template_name: '', description: '', rows: [{ stage_name: '', percentage: '', notes: '' }] });
    setEditorOpen(true);
  };

  const openEdit = (tpl) => {
    setEditing(tpl);
    setForm({
      template_name: tpl.template_name,
      description: tpl.description || '',
      rows: (tpl.rows || []).map(r => ({ ...r })),
    });
    setEditorOpen(true);
  };

  const duplicateTemplate = (tpl) => {
    setEditing(null);
    setForm({
      template_name: `${tpl.template_name} (Copy)`,
      description: tpl.description || '',
      rows: (tpl.rows || []).map(r => ({ ...r })),
    });
    setEditorOpen(true);
  };

  const addRow = () => setForm(f => ({ ...f, rows: [...f.rows, { stage_name: '', percentage: '', notes: '' }] }));
  const removeRow = (idx) => setForm(f => ({ ...f, rows: f.rows.filter((_, i) => i !== idx) }));
  const updateRow = (idx, field, value) =>
    setForm(f => ({ ...f, rows: f.rows.map((r, i) => i === idx ? { ...r, [field]: value } : r) }));

  const totalPct = form.rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);

  const save = async () => {
    if (!form.template_name.trim()) { toast.error('Template name is required'); return; }
    const validRows = form.rows
      .filter(r => r.stage_name?.trim())
      .map(r => ({
        stage_name: r.stage_name.trim(),
        percentage: parseFloat(r.percentage) || 0,
        notes: r.notes || '',
      }));
    if (validRows.length === 0) { toast.error('Add at least one row'); return; }
    if (totalPct > 100.01) { toast.error(`Total exceeds 100% (${totalPct.toFixed(2)}%). Adjust before saving.`); return; }
    setSaving(true);
    try {
      const payload = { template_name: form.template_name.trim(), description: form.description, rows: validRows };
      if (editing?.template_id) {
        await axios.patch(`${API}/payment-schedule-templates/${editing.template_id}`, payload);
        toast.success('Template updated');
      } else {
        await axios.post(`${API}/payment-schedule-templates`, payload);
        toast.success('Template created');
      }
      setEditorOpen(false);
      fetchTemplates();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save template');
    }
    setSaving(false);
  };

  const handleDelete = async (tpl) => {
    if (!window.confirm(`Delete template "${tpl.template_name}"?`)) return;
    try {
      await axios.delete(`${API}/payment-schedule-templates/${tpl.template_id}`);
      toast.success('Template deleted');
      setTemplates(prev => prev.filter(t => t.template_id !== tpl.template_id));
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete'); }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="payment-schedule-templates-page">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-600" /> Payment Schedule Templates</h1>
              <p className="text-xs text-gray-500">Reusable milestone schedules — apply to any project from Payment Schedule → Choose Template</p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" data-testid="new-template-btn">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>

        {/* Templates list */}
        {templates.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-gray-500">No templates yet. Click <span className="font-semibold">New Template</span> to create one.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(tpl => {
              const total = (tpl.rows || []).reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
              return (
                <Card key={tpl.template_id} className="border-2 hover:border-indigo-300 transition-colors" data-testid={`tpl-card-${tpl.template_id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-bold truncate">{tpl.template_name}</CardTitle>
                        {tpl.description && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{tpl.description}</p>}
                      </div>
                      <Badge variant="outline" className={total === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                        {total.toFixed(1)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-1">
                    <p className="text-xs text-gray-500 mb-2">{(tpl.rows || []).length} milestone{(tpl.rows || []).length !== 1 ? 's' : ''}</p>
                    <div className="max-h-40 overflow-y-auto text-[11px] divide-y divide-gray-100 border rounded">
                      {(tpl.rows || []).slice(0, 8).map((r, i) => (
                        <div key={i} className="flex justify-between gap-2 px-2 py-1">
                          <span className="text-gray-700 truncate">{i + 1}. {r.stage_name}</span>
                          <span className="text-gray-500 font-medium shrink-0">{r.percentage}%</span>
                        </div>
                      ))}
                      {(tpl.rows || []).length > 8 && <div className="px-2 py-1 text-center text-gray-400">+{(tpl.rows || []).length - 8} more...</div>}
                    </div>
                    <div className="flex items-center gap-1 mt-3 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => openEdit(tpl)} className="h-7 text-xs" data-testid={`edit-tpl-${tpl.template_id}`}>
                        <Edit2 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => duplicateTemplate(tpl)} className="h-7 text-xs">
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(tpl)} className="h-7 text-xs text-red-600 hover:bg-red-50" data-testid={`delete-tpl-${tpl.template_id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Editor dialog */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Template Name <span className="text-red-500">*</span></Label>
                  <Input value={form.template_name} onChange={(e) => setForm(f => ({ ...f, template_name: e.target.value }))} placeholder="e.g. Standard - Independent House" />
                </div>
                <div>
                  <Label className="text-xs">Description (optional)</Label>
                  <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="When to use this template..." />
                </div>
              </div>

              {/* Rows */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">Milestone Rows</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={totalPct === 100 ? 'bg-emerald-50 text-emerald-700' : totalPct > 100 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}>
                      Total: {totalPct.toFixed(2)}%
                    </Badge>
                    <Button size="sm" variant="outline" onClick={addRow} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" /> Add Row</Button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase border-y">
                    <tr>
                      <th className="px-3 py-1.5 text-left w-10">#</th>
                      <th className="px-3 py-1.5 text-left">Stage Name</th>
                      <th className="px-3 py-1.5 text-right w-24">%</th>
                      <th className="px-3 py-1.5 text-left">Notes</th>
                      <th className="px-3 py-1.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {form.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-2 py-1">
                          <Input value={r.stage_name} onChange={(e) => updateRow(i, 'stage_name', e.target.value)} placeholder="Milestone name" className="h-8 text-xs" data-testid={`tpl-row-name-${i}`} />
                        </td>
                        <td className="px-2 py-1">
                          <Input type="number" min="0" max="100" step="0.01" value={r.percentage} onChange={(e) => updateRow(i, 'percentage', e.target.value)} className="h-8 text-xs text-right" data-testid={`tpl-row-pct-${i}`} />
                        </td>
                        <td className="px-2 py-1">
                          <Input value={r.notes || ''} onChange={(e) => updateRow(i, 'notes', e.target.value)} placeholder="optional" className="h-8 text-xs" />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => removeRow(i)} data-testid={`tpl-row-del-${i}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="save-tpl-btn">
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
