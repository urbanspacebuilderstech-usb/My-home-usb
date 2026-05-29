import { useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Renders a confirm-password dialog for Super Admin to unlock edit on items
 * that the client has already approved (RE / FE / Additional Costs / Deductions).
 *
 * Usage:
 *   const [confirmOpen, setConfirmOpen] = useState(false);
 *   const [confirmToken, setConfirmToken] = useState(null);
 *   <SuperAdminConfirmDialog
 *     open={confirmOpen}
 *     onClose={() => setConfirmOpen(false)}
 *     onConfirm={(token) => { setConfirmToken(token); ...do edit with header X-SuperAdmin-Confirm }}
 *   />
 *
 * The returned token is valid for 10 minutes. Forward it on the edit request:
 *   axios.patch(url, body, { headers: { 'X-SuperAdmin-Confirm': token } })
 */
export default function SuperAdminConfirmDialog({ open, onClose, onConfirm, title = 'Confirm Edit on Locked Item' }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!password) { toast.error('Password required'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/superadmin/confirm-password`, { password });
      onConfirm(res.data.token, res.data.expires_in_seconds);
      setPassword('');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" /> {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">This item was approved by the client and is locked. As Super Admin, enter your password to unlock editing for the next 10 minutes.</p>
          <div>
            <Label htmlFor="su-pwd" className="text-xs">Password</Label>
            <div className="relative">
              <Input
                id="su-pwd"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Super Admin password"
                autoFocus
                data-testid="su-confirm-pwd"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShow(s => !s)}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={submitting}>Cancel</Button>
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={submit} disabled={submitting} data-testid="su-confirm-submit">
            {submitting ? 'Verifying…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
