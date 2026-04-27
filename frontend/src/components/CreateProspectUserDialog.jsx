import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Loader2, UserPlus, Smartphone, Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Sales: provision a mobile prospect login from a lead.
 * Pre-fills name + email from the lead. Sales sets a password for the prospect.
 */
export default function CreateProspectUserDialog({ open, onOpenChange, lead, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (open && lead) {
      setForm({
        name: lead.client_name || lead.name || '',
        email: lead.email || lead.client_email || '',
        phone: lead.phone || lead.client_phone || '',
        password: '',
      });
      setCreated(null);
      setShowPwd(false);
    }
  }, [open, lead]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API}/leads/${lead.lead_id}/create-prospect-user`, {
        lead_id: lead.lead_id,
        re_project_id: lead.re_project_id || null,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone || '',
        password: form.password,
      });
      setCreated({ ...r.data, plain_password: form.password });
      toast.success('Prospect login created. Share the credentials below.');
      onCreated && onCreated(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (txt) => { navigator.clipboard.writeText(txt); toast.success('Copied'); };
  const buildShareText = (c) => {
    const url = window.location.origin;
    return `*Welcome to Urban Space Builders!*\n\nYour stress-free construction quote is ready.\n\nLogin here: ${url}/login\nEmail: ${c.email}\nPassword: ${c.plain_password}\n\nUse this link on your *mobile* for the best experience.`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-600" /> Move to RE Client — Create Prospect Login
          </DialogTitle>
        </DialogHeader>
        {!created ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Provision a mobile-only quote viewer for this prospect. They'll be able to view the GM-approved estimate, watch testimonials & call you back.</p>
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="prospect-form-name" />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="prospect-form-email" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91…" data-testid="prospect-form-phone" />
            </div>
            <div>
              <Label className="text-xs">Password *</Label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                  data-testid="prospect-form-password"
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1 h-7 w-7 p-0" onClick={() => setShowPwd(s => !s)}>
                  {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">You'll share this with the prospect via WhatsApp/SMS after creation.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-800">Login created. Share these with {created.name}:</p>
            </div>
            <div className="grid gap-2">
              {[
                ['Email', created.email],
                ['Password', created.plain_password],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between bg-gray-50 rounded p-2">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">{k}</p>
                    <p className="text-sm font-medium font-mono">{v}</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copy(v)} data-testid={`copy-${k.toLowerCase()}`}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => copy(buildShareText(created))}
              data-testid="copy-whatsapp-share"
            >
              <Copy className="h-4 w-4" /> Copy WhatsApp-ready welcome message
            </Button>
          </div>
        )}
        <DialogFooter>
          {!created ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting} data-testid="prospect-submit">
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> : <><UserPlus className="h-4 w-4 mr-1" /> Create User</>}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
