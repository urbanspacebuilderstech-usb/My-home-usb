import { useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, MessageCircle, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PORTAL_BASE = window.location.origin + '/client';

function gen_password(len = 8) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function CreateClientPortalDialog({ project, open, onOpenChange, onCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog opens for a different project
  const reset = () => {
    setEmail(project?.client_email || '');
    setPassword(gen_password(8));
    setCreated(null);
    setCopied(false);
  };
  // initialize on open
  if (open && !created && password === '' && project) reset();

  const submit = async () => {
    if (!email || !email.includes('@')) { toast.error('Enter a valid email'); return; }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/projects/${project.project_id}/create-client-portal`, { email: email.trim(), password });
      setCreated(res.data);
      toast.success('Client portal created');
      onCreated?.(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create client portal');
    } finally { setSubmitting(false); }
  };

  const buildShareMessage = () => {
    const cred = created || { email, password };
    return `Hello ${project?.client_name || 'Sir/Ma\'am'},\n\nYour project portal is ready.\n\n🏗 Project: ${project?.name || ''}\n🔗 Login: ${PORTAL_BASE}\n📧 Email: ${cred.email}\n🔑 Password: ${cred.password}\n\nThank you!`;
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(buildShareMessage());
      setCopied(true);
      toast.success('Credentials copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch { toast.error('Could not copy. Long-press to copy manually.'); }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(buildShareMessage());
    const phone = (project?.client_phone || '').replace(/\D/g, '');
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handleClose = () => {
    setEmail(''); setPassword(''); setCreated(null); setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="create-client-portal-dialog">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-600" /> Create Client Portal</DialogTitle>
          <DialogDescription className="text-xs">For {project?.name} · {project?.client_name}</DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="text-sm mt-1"
                data-testid="ccp-email"
              />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <div className="flex gap-1 mt-1">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-sm font-mono"
                  data-testid="ccp-password"
                />
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setPassword(gen_password(8))} title="Generate" data-testid="ccp-regen">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Min 6 characters. The password is shown only once after creation.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={submitting} onClick={submit} data-testid="ccp-submit">
                {submitting ? 'Creating...' : 'Create Portal'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs">
              <p className="font-bold text-green-900 mb-2">✓ Portal Ready</p>
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2"><span className="text-green-700">Login URL:</span><span className="font-mono text-green-900 truncate">{PORTAL_BASE}</span></div>
                <div className="flex justify-between gap-2"><span className="text-green-700">Email:</span><span className="font-mono text-green-900">{created.email}</span></div>
                <div className="flex justify-between gap-2"><span className="text-green-700">Password:</span><span className="font-mono text-green-900">{created.password}</span></div>
              </div>
            </div>
            <div className="bg-gray-50 border rounded-lg p-2.5 text-[11px] text-gray-700 max-h-32 overflow-y-auto whitespace-pre-wrap" data-testid="ccp-share-preview">
              {buildShareMessage()}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={copyMessage} className="gap-1" data-testid="ccp-copy">
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={shareWhatsApp} data-testid="ccp-whatsapp">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
