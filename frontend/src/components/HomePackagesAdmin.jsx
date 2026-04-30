import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Plus, Edit, Trash2, Loader2, Package as PackageIcon, ChevronDown, ChevronUp, X, Star, Sparkles, FileText, Upload } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyPkg = {
  name: '',
  short_name: '',
  price_per_sqft: 0,
  original_price_per_sqft: 0,
  is_popular: false,
  sort_order: 0,
  sections: [],
};

export default function HomePackagesAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(emptyPkg);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  // Master package brochure (global PDF sent in Share Package dialog)
  const [brochure, setBrochure] = useState(null);
  const [brochureUploading, setBrochureUploading] = useState(false);
  const pdfInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, br] = await Promise.all([
        axios.get(`${API}/home-packages`),
        axios.get(`${API}/user-app/master-brochure`).catch(() => ({ data: null })),
      ]);
      setItems(r.data || []);
      setBrochure(br?.data?.filename ? br.data : null);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setDialog({ open: true, editing: null }); setForm({ ...emptyPkg, sections: [{ title: '', bullets: [''] }] }); };
  const openEdit = (item) => { setDialog({ open: true, editing: item }); setForm({
    name: item.name || '', short_name: item.short_name || '',
    price_per_sqft: item.price_per_sqft || 0, original_price_per_sqft: item.original_price_per_sqft || 0,
    is_popular: !!item.is_popular, sort_order: item.sort_order || 0,
    sections: (item.sections || []).map(s => ({ title: s.title, bullets: [...(s.bullets || [])] })),
  }); };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.price_per_sqft) { toast.error('Price per sqft is required'); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        price_per_sqft: Number(form.price_per_sqft),
        original_price_per_sqft: Number(form.original_price_per_sqft) || null,
        sort_order: Number(form.sort_order) || 0,
        sections: form.sections.filter(s => s.title.trim()).map(s => ({ title: s.title.trim(), bullets: (s.bullets || []).map(b => b.trim()).filter(Boolean) })),
      };
      if (dialog.editing) await axios.patch(`${API}/home-packages/${dialog.editing.package_id}`, payload);
      else await axios.post(`${API}/home-packages`, payload);
      toast.success(dialog.editing ? 'Package updated' : 'Package created');
      setDialog({ open: false, editing: null });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const remove = async (pkg) => {
    if (!window.confirm(`Remove "${pkg.name}"?`)) return;
    try { await axios.delete(`${API}/home-packages/${pkg.package_id}`); toast.success('Package removed'); load(); }
    catch { toast.error('Failed'); }
  };

  const seedDefaults = async () => {
    if (!window.confirm('Seed the 3 default packages (Budget Friendly / Value for Money / Builder\'s Choice)? Existing packages with same names will be UPDATED.')) return;
    setSeeding(true);
    try {
      const r = await axios.post(`${API}/home-packages/seed-defaults`);
      toast.success(`Inserted ${r.data.inserted}, updated ${r.data.updated}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
    finally { setSeeding(false); }
  };

  // ============ Master Brochure (single global PDF used by Share Package dialog) ============
  const handleBrochureFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error('PDF too large (max 15MB)'); return; }
    setBrochureUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await axios.post(`${API}/uploads/pdf`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const saved = await axios.put(`${API}/user-app/master-brochure`, {
        filename: up.data.filename,
        original_name: up.data.original_name,
        size_bytes: up.data.size_bytes,
      });
      setBrochure(saved.data);
      toast.success('Master brochure uploaded. Pre-Sales will receive this PDF when sharing packages.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setBrochureUploading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const removeBrochure = async () => {
    if (!window.confirm('Remove the uploaded master brochure? Pre-Sales will switch back to the auto-generated PDF.')) return;
    try {
      await axios.delete(`${API}/user-app/master-brochure`);
      setBrochure(null);
      toast.success('Master brochure cleared. Auto-generated PDF will be used instead.');
    } catch { toast.error('Failed to remove'); }
  };

  const previewBrochure = () => {
    if (brochure?.filename) {
      window.open(`${API}/uploads/file/${brochure.filename}`, '_blank');
    }
  };

  // Section editor helpers
  const addSection = () => setForm({ ...form, sections: [...form.sections, { title: '', bullets: [''] }] });
  const removeSection = (i) => setForm({ ...form, sections: form.sections.filter((_, k) => k !== i) });
  const updateSection = (i, patch) => setForm({ ...form, sections: form.sections.map((s, k) => k === i ? { ...s, ...patch } : s) });
  const addBullet = (i) => updateSection(i, { bullets: [...(form.sections[i].bullets || []), ''] });
  const removeBullet = (i, j) => updateSection(i, { bullets: form.sections[i].bullets.filter((_, k) => k !== j) });
  const updateBullet = (i, j, value) => updateSection(i, { bullets: form.sections[i].bullets.map((b, k) => k === j ? value : b) });

  return (
    <div>
      {/* Master Package Brochure Uploader */}
      <Card className="mb-4 border-amber-200 bg-gradient-to-r from-amber-50 to-white">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">Master Package Brochure (PDF)</p>
                {brochure?.filename ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Active</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px]">Not set (auto-generated PDF in use)</Badge>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                Upload a designed brochure here — Pre-Sales gets this file when they click <span className="font-semibold">Download PDF</span> in the Share Package Link dialog. If no file is uploaded, the system auto-generates a PDF from the package cards below.
              </p>
              {brochure?.filename && (
                <p className="text-[11px] text-gray-500 mt-1 font-mono truncate">
                  {brochure.original_name || brochure.filename} · {Math.round((brochure.size_bytes || 0) / 1024)} KB
                  {brochure.updated_at && <> · uploaded {new Date(brochure.updated_at).toLocaleDateString()}</>}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleBrochureFile}
              className="hidden"
              data-testid="brochure-file-input"
            />
            <Button
              size="sm"
              onClick={() => pdfInputRef.current?.click()}
              disabled={brochureUploading}
              className="bg-amber-600 hover:bg-amber-700 gap-1"
              data-testid="brochure-upload-btn"
            >
              {brochureUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> {brochure ? 'Replace PDF' : 'Upload PDF'}</>}
            </Button>
            {brochure?.filename && (
              <>
                <Button size="sm" variant="outline" onClick={previewBrochure} data-testid="brochure-preview-btn">
                  Preview
                </Button>
                <Button size="sm" variant="outline" onClick={removeBrochure} className="text-red-600 hover:bg-red-50 hover:text-red-700" data-testid="brochure-remove-btn">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </>
            )}
            <span className="text-[10px] text-gray-400 self-center ml-auto">PDF only · max 15 MB</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-500">Each package shows on the public package link with a dropdown selector + accordion sections.</div>
        <div className="flex items-center gap-2">
          {items.length === 0 && (
            <Button onClick={seedDefaults} disabled={seeding} variant="outline" className="text-xs gap-1" data-testid="hp-seed-btn">
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
              Seed 3 Defaults
            </Button>
          )}
          <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700 gap-1" data-testid="hp-add-btn">
            <Plus className="h-4 w-4" /> Add Package
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">
          <PackageIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          No packages yet. Click <span className="font-semibold text-amber-600">Seed 3 Defaults</span> to start with the standard 3 (Budget Friendly / Value for Money / Builder's Choice).
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(p => (
            <Card key={p.package_id} className="hover:shadow-md transition-shadow border-amber-200" data-testid={`hp-card-${p.package_id}`}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate flex items-center gap-1">
                      {p.name}
                      {p.is_popular && <Badge className="bg-red-500 text-white border-0 text-[9px]"><Star className="h-2.5 w-2.5 mr-0.5" />Popular</Badge>}
                    </p>
                    <p className="text-[11px] text-amber-600 font-mono">{p.short_name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)} data-testid={`hp-edit-${p.package_id}`}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => remove(p)} data-testid={`hp-del-${p.package_id}`}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  {p.original_price_per_sqft > p.price_per_sqft && <span className="text-xs text-gray-400 line-through">₹{p.original_price_per_sqft}</span>}
                  <span className="text-lg font-bold text-amber-700">₹{p.price_per_sqft}</span>
                  <span className="text-[10px] text-gray-500">/sqft</span>
                </div>
                <p className="text-[10px] text-gray-500">{p.sections?.length || 0} sections · sort {p.sort_order}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, editing: null })}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit' : 'Add'} Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Display Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Builder's Choice" data-testid="hp-form-name" />
              </div>
              <div>
                <Label className="text-xs">Short / Tag Name</Label>
                <Input value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} placeholder="BUILDER'S CHOICE" />
              </div>
              <div>
                <Label className="text-xs">Price per Sqft (₹) *</Label>
                <Input type="number" value={form.price_per_sqft} onChange={e => setForm({ ...form, price_per_sqft: e.target.value })} placeholder="2299" data-testid="hp-form-price" />
              </div>
              <div>
                <Label className="text-xs">Original Price (strike-through)</Label>
                <Input type="number" value={form.original_price_per_sqft} onChange={e => setForm({ ...form, original_price_per_sqft: e.target.value })} placeholder="2599" />
              </div>
              <div>
                <Label className="text-xs">Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={form.is_popular} onCheckedChange={v => setForm({ ...form, is_popular: v })} id="popular" />
                <Label htmlFor="popular" className="text-xs cursor-pointer">Mark as Most Popular</Label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">Sections (dropdown items)</Label>
                <Button size="sm" variant="outline" onClick={addSection} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" /> Add Section</Button>
              </div>
              <div className="space-y-2.5">
                {form.sections.map((sec, i) => (
                  <Card key={i} className="bg-amber-50/40 border-amber-200">
                    <CardContent className="p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={sec.title}
                          onChange={e => updateSection(i, { title: e.target.value })}
                          placeholder="Section title (e.g. Flooring)"
                          className="h-8 text-sm font-medium"
                          data-testid={`hp-section-title-${i}`}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => removeSection(i)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="space-y-1">
                        {(sec.bullets || []).map((b, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <span className="text-amber-500 text-xs">•</span>
                            <Input
                              value={b}
                              onChange={e => updateBullet(i, j, e.target.value)}
                              placeholder="Bullet point"
                              className="h-7 text-xs flex-1"
                              data-testid={`hp-bullet-${i}-${j}`}
                            />
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400" onClick={() => removeBullet(i, j)}><X className="h-3 w-3" /></Button>
                          </div>
                        ))}
                        <Button size="sm" variant="ghost" onClick={() => addBullet(i)} className="h-6 px-2 text-[10px] gap-1 text-amber-700"><Plus className="h-2.5 w-2.5" /> Add Bullet</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {form.sections.length === 0 && (
                  <p className="text-[11px] text-gray-400 italic text-center py-2">No sections yet — click "Add Section" to start.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })} disabled={submitting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={submit} disabled={submitting} data-testid="hp-submit">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : (dialog.editing ? 'Save Changes' : 'Create Package')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
