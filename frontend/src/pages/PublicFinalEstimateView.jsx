import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Phone, MapPin, FileText, Download } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function PublicFinalEstimateView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/public/fe/${token}`);
        if (mounted) setData(r.data);
      } catch (e) {
        if (mounted) setErr(e.response?.data?.detail || 'Could not load estimate');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  const handleDownload = () => {
    window.print();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-pulse text-gray-400">Loading…</div>
    </div>
  );

  if (err) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="h-12 w-12 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-red-500" />
          </div>
          <p className="font-medium text-gray-800">Estimate not available</p>
          <p className="text-sm text-gray-500 mt-1">{err}</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-semibold text-gray-700">My Home USB</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleDownload} data-testid="fe-download-btn">
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <CardTitle className="text-xl text-gray-900">{data.project_name}</CardTitle>
                <p className="text-sm text-gray-500 mt-0.5">Final Estimate · Revision {data.revision || 0}</p>
              </div>
              <Badge variant="outline" className="text-xs">
                Reference Document
              </Badge>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-600" /> Scope of Work
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="fe-scope-table">
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
                      <td className="px-4 py-2 text-right">{(s.unit_rate || s.rate) ? fmt(s.unit_rate || s.rate) : '-'}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmt(s.total_amount || s.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td colSpan="5" className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Project Value</td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-amber-700" data-testid="fe-total">{fmt(data.total_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 pt-2 pb-6">
          Estimate ref: {data.project_id} · Generated: {data.sent_at ? new Date(data.sent_at).toLocaleDateString() : '-'}
        </p>
      </div>
    </div>
  );
}
