import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, MapPin, FileText, Download, Copy, ExternalLink } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function CREFEDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

        {/* Scope items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-600" /> Scope of Work
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="fe-detail-scope-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data.scope || []).length === 0 ? (
                    <tr><td colSpan="6" className="text-center text-gray-400 p-6">No scope items</td></tr>
                  ) : data.scope.map((s, i) => (
                    <tr key={s.scope_id || i}>
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{s.item_name || s.name}</td>
                      <td className="px-4 py-2 text-right">{s.quantity || '-'}</td>
                      <td className="px-4 py-2 text-gray-500">{s.unit || '-'}</td>
                      <td className="px-4 py-2 text-right">{s.unit_rate ? fmt(s.unit_rate) : '-'}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmt(s.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td colSpan="5" className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Project Value</td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-amber-700" data-testid="fe-detail-total">{fmt(data.total_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

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
    </div>
  );
}
