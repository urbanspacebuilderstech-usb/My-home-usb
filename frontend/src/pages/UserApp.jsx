import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Edit, Trash2, Smartphone, PlayCircle, Building2, Loader2, Sparkles, Construction, Package as PackageIcon } from 'lucide-react';
import HomePackagesAdmin from '../components/HomePackagesAdmin';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const empty = { title: '', description: '', youtube_url: '', cover_image_url: '', location: '', floor_config: 'all', sort_order: 0 };

const TYPES = {
  testimonials: { label: 'Testimonials', endpoint: 'testimonials', Icon: PlayCircle, color: 'text-red-600', accent: 'red', requiresYoutube: true },
  completed: { label: 'Completed Projects', endpoint: 'completed', Icon: Building2, color: 'text-emerald-600', accent: 'emerald', requiresYoutube: false },
  ongoing: { label: 'Ongoing Projects', endpoint: 'ongoing', Icon: Construction, color: 'text-amber-600', accent: 'amber', requiresYoutube: false },
};

export default function UserApp() {
  const [tab, setTab] = useState('testimonials');
  const [items, setItems] = useState({ testimonials: [], completed: [], ongoing: [] });
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState({ open: false, type: null, editing: null });
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  const load = async (type) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/user-app/${TYPES[type].endpoint}`);
      setItems(prev => ({ ...prev, [type]: r.data || [] }));
    } catch (e) {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(tab); /* eslint-disable-next-line */ }, [tab]);

  const openCreate = (type) => { setDialog({ open: true, type, editing: null }); setForm({ ...empty }); };
  const openEdit = (type, item) => { setDialog({ open: true, type, editing: item }); setForm({ ...empty, ...item }); };

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (TYPES[dialog.type].requiresYoutube && !form.youtube_url.trim()) {
      toast.error('YouTube URL is required for testimonials'); return;
    }
    setSubmitting(true);
    try {
      const ep = TYPES[dialog.type].endpoint;
      const url = dialog.editing ? `${API}/user-app/${ep}/${dialog.editing.id}` : `${API}/user-app/${ep}`;
      const method = dialog.editing ? 'patch' : 'post';
      await axios[method](url, form);
      toast.success(dialog.editing ? 'Updated' : 'Created');
      setDialog({ open: false, type: null, editing: null });
      load(dialog.type);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally { setSubmitting(false); }
  };

  const remove = async (type, item) => {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    try {
      await axios.delete(`${API}/user-app/${TYPES[type].endpoint}/${item.id}`);
      toast.success('Removed');
      load(type);
    } catch (e) { toast.error('Failed'); }
  };

  const list = items[tab] || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-emerald-600" /> User App Content
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage testimonials and project showcases shown to mobile prospect users.</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4">
            {Object.entries(TYPES).map(([k, t]) => (
              <TabsTrigger key={k} value={k} data-testid={`ua-tab-${k}`}>
                <t.Icon className={`h-3.5 w-3.5 mr-1 ${t.color}`} /> {t.label}
                <Badge className="ml-1 bg-gray-100 text-gray-700 text-[10px]">{(items[k] || []).length}</Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger value="packages" data-testid="ua-tab-packages">
              <PackageIcon className="h-3.5 w-3.5 mr-1 text-amber-600" /> Packages
            </TabsTrigger>
          </TabsList>
          {Object.entries(TYPES).map(([k, t]) => (
            <TabsContent key={k} value={k}>
              <div className="flex justify-end mb-3">
                <Button onClick={() => openCreate(k)} className="bg-emerald-600 hover:bg-emerald-700 gap-1" data-testid={`ua-add-${k}`}>
                  <Plus className="h-4 w-4" /> Add {t.label.replace('s$', '').slice(0, -1)}
                </Button>
              </div>
              {loading ? (
                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
              ) : list.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-gray-400">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  No {t.label.toLowerCase()} yet. Click <span className="font-semibold text-emerald-600">Add</span> to create one.
                </CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.filter(i => i.is_active !== false).map(item => (
                    <Card key={item.id} className="hover:shadow-md transition-shadow" data-testid={`ua-card-${item.id}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{item.title}</p>
                            {item.location && <p className="text-[11px] text-gray-500 truncate">{item.location}</p>}
                            <Badge className="bg-gray-100 text-gray-700 text-[10px] mt-1">{item.floor_config || 'all'}</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(k, item)} data-testid={`ua-edit-${item.id}`}><Edit className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => remove(k, item)} data-testid={`ua-del-${item.id}`}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                        {item.youtube_url && <p className="text-[10px] text-gray-400 truncate font-mono">▶ {item.youtube_url}</p>}
                        {item.description && <p className="text-[11px] text-gray-600 line-clamp-2">{item.description}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
          <TabsContent value="packages">
            <HomePackagesAdmin />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, type: null, editing: null })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit' : 'Add'} — {dialog.type ? TYPES[dialog.type].label : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mr Sharma's 3BHK Villa" data-testid="ua-form-title" />
            </div>
            {dialog.type !== 'testimonials' && (
              <div>
                <Label className="text-xs">Location</Label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Whitefield, Bangalore" />
              </div>
            )}
            <div>
              <Label className="text-xs">YouTube URL {dialog.type === 'testimonials' ? '*' : '(optional)'}</Label>
              <Input value={form.youtube_url} onChange={e => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtu.be/abc123" data-testid="ua-form-youtube" />
            </div>
            {dialog.type !== 'testimonials' && (
              <div>
                <Label className="text-xs">Cover Image URL (optional, falls back to YouTube thumbnail)</Label>
                <Input value={form.cover_image_url} onChange={e => setForm({ ...form, cover_image_url: e.target.value })} placeholder="https://…" />
              </div>
            )}
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Floor Config Filter</Label>
                <Input value={form.floor_config} onChange={e => setForm({ ...form, floor_config: e.target.value })} placeholder="all / 2BHK G+1 / 3BHK G+2…" />
                <p className="text-[10px] text-gray-400 mt-0.5">Type "all" to show to every prospect.</p>
              </div>
              <div>
                <Label className="text-xs">Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, type: null, editing: null })} disabled={submitting}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting} data-testid="ua-submit">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : (dialog.editing ? 'Save' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
