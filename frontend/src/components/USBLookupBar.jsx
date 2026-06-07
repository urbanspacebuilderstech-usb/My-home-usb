import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowUpRight, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PREFIXES = [
  { value: 'USB-P',  label: 'Project (P)' },
  { value: 'USB-W',  label: 'Work Order (W)' },
  { value: 'USB-FE', label: 'Final Estimate (FE)' },
  { value: 'USB-RE', label: 'Rough Estimate (RE)' },
  { value: 'USB-MR', label: 'Material Request (MR)' },
];

/**
 * Compact USB-number quick-jump bar — Super Admin only.
 * Prefix dropdown + numeric input + Search. On hit, opens a popup with the
 * resolved entity's key fields and an "Open" button that navigates to the
 * relevant page.
 */
export default function USBLookupBar() {
  const [prefix, setPrefix] = useState('USB-P');
  const [num, setNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!num.trim()) { toast.error('Enter a number'); return; }
    setLoading(true);
    try {
      const r = await axios.get(`${API}/admin/lookup`, { params: { prefix, number: num.trim() } });
      setResult(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Lookup failed');
    } finally { setLoading(false); }
  };

  const goTo = () => {
    if (!result?.navigate_to) return;
    setResult(null);
    setNum('');
    navigate(result.navigate_to);
  };

  return (
    <>
      <form onSubmit={submit} className="hidden md:flex items-stretch gap-1 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 px-1 py-0.5" data-testid="usb-lookup-bar">
        <Select value={prefix} onValueChange={setPrefix}>
          <SelectTrigger className="h-7 text-xs w-[88px] border-0 bg-transparent focus:ring-0 px-2" data-testid="usb-lookup-prefix">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PREFIXES.map(p => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={num}
          onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="00001"
          className="h-7 text-xs w-[80px] border-0 bg-transparent focus-visible:ring-0 px-1 font-mono"
          inputMode="numeric"
          data-testid="usb-lookup-number"
        />
        <Button type="submit" size="sm" disabled={loading} className="h-7 px-2 gap-1 bg-violet-600 hover:bg-violet-700 text-white" data-testid="usb-lookup-submit">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        </Button>
      </form>

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md" data-testid="usb-lookup-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Badge className="font-mono bg-violet-600 hover:bg-violet-600">{result?.number}</Badge>
              <span className="capitalize">{(result?.kind || '').replace('_', ' ')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">{result?.subtitle || ''}</DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-[10px] uppercase text-gray-500">Title</p>
                <p className="font-semibold text-gray-900">{result.title || '—'}</p>
              </div>
              {result.status && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500">Status</p>
                  <Badge variant="outline" className="text-[11px] capitalize">{(result.status || '').replace(/_/g, ' ')}</Badge>
                </div>
              )}
              {typeof result.amount === 'number' && result.amount > 0 && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500">Amount</p>
                  <p className="font-semibold text-teal-700">₹{result.amount.toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResult(null)} data-testid="usb-lookup-close">Close</Button>
            <Button size="sm" onClick={goTo} className="bg-violet-600 hover:bg-violet-700 gap-1" data-testid="usb-lookup-open">
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
