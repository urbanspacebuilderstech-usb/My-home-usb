import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, MapPin, FileText, Download, Copy, ExternalLink, KeyRound, Eye, EyeOff } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function CREFEDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credDialog, setCredDialog] = useState({ open: false, email: '', password: '', showPwd: false, submitting: false });

  const handleCreateCredentials = async () => {
    const { email, password } = credDialog;
    if (!email || !email.includes('@')) { toast.error('Valid email required'); return; }
    if (!password || password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setCredDialog(c => ({ ...c, submitting: true }));
    try {
      await axios.post(`${API}/projects/${projectId}/create-client-portal`, { email, password });
      toast.success('Client portal credentials created — share via WhatsApp');
      setCredDialog({ open: false, email: '', password: '', showPwd: false, submitting: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create credentials');
      setCredDialog(c => ({ ...c, submitting: false }));
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meRes, list] = await Promise.all([
          axios.get(`${API}/auth/me`),
          axios.get(`${API}/cre/final-estimates`),
        ]);
        if (!mounted) return;
        setUser(meRes.data);
        const project = (list.data || []).find(p => p.project_id === projectId);
        if (!project) {
          toast.error('Final Estimate not found');
          navigate('/cre-board');
          return;
        }
        let token = project.fe?.public_token;
        if (!token) {
          const t = await axios.post(`${API}/cre/final-estimates/${projectId}/send-to-client`);
          token = t.data?.public_token;
        }
        const detail = await axios.get(`${API}/public/fe/${token}`);
        if (mounted) {
          setData({ ...detail.data, project, token });
        }
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Could not load Final Estimate');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [projectId, navigate]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-5xl mx-auto px-4 py-8 text-center text-gray-400">Loading…</div>
    </div>
  );
  if (!data) return null;

  const fe = data.project?.fe || {};
  const publicUrl = data.token ? `${window.location.origin}/fe/${data.token}` : '';

  const statusBadge = (() => {
    if (fe.status === 'approved') return { cls: 'bg-green-100 text-green-700', label: 'Approved' };
    if (fe.status === 'review_pending') return { cls: 'bg-amber-100 text-amber-700', label: 'Review Sent to Planning' };
    if (fe.status === 'pending_cre_review') return { cls: 'bg-purple-100 text-purple-700', label: 'Awaiting Your Action' };
    return { cls: 'bg-gray-100 text-gray-700', label: fe.status || 'Draft' };
  })();

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-4" data-testid="cre-fe-detail">
      <AppHeader user={user} />
      <main className="max-w-5xl mx-auto px-3 md:px-6 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/cre-board?tab=final_estimate')} data-testid="fe-detail-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
              onClick={() => setCredDialog({ open: true, email: data?.client_email || '', password: '', showPwd: false, submitting: false })}
              data-testid="fe-detail-create-credentials"
            >
              <KeyRound className="h-3.5 w-3.5" /> Create Credentials
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()} data-testid="fe-detail-download">
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </Button>
          </div>
        </div>

        {/* Project header */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <CardTitle className="text-xl text-gray-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  {data.project_name}
                </CardTitle>
                <p className="text-sm text-gray-500 mt-0.5">Final Estimate · Revision {data.revision || 0}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Rev {data.revision || 0}</Badge>
                <Badge className={`text-xs ${statusBadge.cls}`}>{statusBadge.label}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Client</p>
                <p className="font-medium">{data.client_name}</p>
              </div>
              {data.client_phone && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                  <p className="font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{data.client_phone}</p>
                </div>
              )}
              {data.location && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Location</p>
                  <p className="font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{data.location}</p>
                </div>
              )}
            </div>
            {publicUrl && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2">
                <span className="text-xs text-gray-500">Public client link:</span>
                <code className="flex-1 text-xs bg-gray-50 px-2 py-1 rounded border truncate">{publicUrl}</code>
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Copied'); }} data-testid="fe-detail-copy-link">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => window.open(publicUrl, '_blank')} data-testid="fe-detail-open-link">
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scope of Work — hidden from CRE per business rule (amounts confidential) */}

        {/* Reviews history */}
        {(fe.reviews || []).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Review History ({fe.reviews.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {fe.reviews.map((r, i) => (
                <div key={i} className="border rounded-md p-3 bg-amber-50 border-amber-200" data-testid={`fe-detail-review-${r.review_no}`}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className="bg-amber-200 text-amber-900 text-xs">Review #{r.review_no}</Badge>
                    <Badge variant="outline" className="text-xs">on Rev {r.revision}</Badge>
                    <span className="text-xs text-gray-500 ml-auto">{new Date(r.at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-800 italic">"{r.text}"</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create Client Credentials Dialog */}
      <Dialog open={credDialog.open} onOpenChange={(o) => !credDialog.submitting && setCredDialog(c => ({ ...c, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-amber-600" /> Create Client Portal Credentials</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-gray-500">These credentials let your client log into the portal to view their Final Estimate, payment schedule, and approve milestones. Share via WhatsApp once created.</p>
            <div>
              <Label htmlFor="cred-email" className="text-xs">Client Email</Label>
              <Input
                id="cred-email"
                type="email"
                value={credDialog.email}
                onChange={(e) => setCredDialog(c => ({ ...c, email: e.target.value }))}
                placeholder="client@example.com"
                data-testid="cred-email-input"
              />
            </div>
            <div>
              <Label htmlFor="cred-password" className="text-xs">Password (min 6 chars)</Label>
              <div className="relative">
                <Input
                  id="cred-password"
                  type={credDialog.showPwd ? 'text' : 'password'}
                  value={credDialog.password}
                  onChange={(e) => setCredDialog(c => ({ ...c, password: e.target.value }))}
                  placeholder="Choose a password"
                  data-testid="cred-password-input"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setCredDialog(c => ({ ...c, showPwd: !c.showPwd }))}
                >
                  {credDialog.showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredDialog({ open: false, email: '', password: '', showPwd: false, submitting: false })} disabled={credDialog.submitting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleCreateCredentials} disabled={credDialog.submitting} data-testid="cred-submit-btn">
              {credDialog.submitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
