import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Sparkles, Power, Save } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_DAYS = 60;

// India date, so "today" matches what the backend checks (midnight IST).
const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

// Oct 30 2026 — HR Portal → Settings → Animation: when the Diwali mascot +
// fireworks show on the login page (start date + number of days).
export default function LoginAnimationSettings() {
  const [saved, setSaved] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/branding`).then((r) => {
      const w = r.data?.login_animation || {};
      setSaved(w);
      setStartDate(w.start_date || '');
      setDays(w.days ? String(w.days) : '');
    }).catch(() => setSaved({}));
  }, []);

  const nDays = parseInt(days, 10);
  const valid = !!startDate && nDays >= 1 && nDays <= MAX_DAYS;
  const endDate = valid ? addDays(startDate, nDays - 1) : null;

  const status = (() => {
    if (!saved?.start_date) return { label: 'Off', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
    const t = todayIST();
    if (t < saved.start_date) return { label: `Scheduled · starts ${fmtDate(saved.start_date)}`, cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (t > saved.end_date) return { label: `Ended ${fmtDate(saved.end_date)}`, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
    return { label: `Live now · until ${fmtDate(saved.end_date)}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  })();

  const save = async (payload) => {
    setBusy(true);
    try {
      const r = await axios.patch(`${API}/admin/login-animation`, payload);
      setSaved(r.data);
      setStartDate(r.data.start_date || '');
      setDays(r.data.days ? String(r.data.days) : '');
      toast.success(r.data.start_date ? 'Login animation scheduled' : 'Login animation turned off');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (!saved) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <Card data-testid="login-animation-settings">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Sparkles className="h-5 w-5 text-amber-500" />Login Page Animation
          <Badge variant="outline" className={`text-xs ${status.cls}`} data-testid="login-animation-status">{status.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          The 3D mascot runs onto the login page, flower pots light up and four rockets burst, then it runs off after 13 seconds.
          It shows to everyone who opens the login page, only on the days below.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="la-start">Start date</Label>
            <Input id="la-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="login-animation-start" />
          </div>
          <div>
            <Label htmlFor="la-days">How many days</Label>
            <Input id="la-days" type="number" min="1" max={MAX_DAYS} value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 5" data-testid="login-animation-days" />
          </div>
          <div>
            <Label>Last day</Label>
            <div className="h-10 flex items-center text-sm font-medium text-gray-800" data-testid="login-animation-end">{fmtDate(endDate)}</div>
          </div>
        </div>
        {days !== '' && !(nDays >= 1 && nDays <= MAX_DAYS) && (
          <p className="text-xs text-red-600">Days must be between 1 and {MAX_DAYS}.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save({ start_date: startDate, days: nDays })} disabled={!valid || busy} className="bg-amber-600 hover:bg-amber-700" data-testid="login-animation-save">
            <Save className="h-4 w-4 mr-1" />Save
          </Button>
          {saved.start_date && (
            <Button variant="outline" onClick={() => save({ start_date: null })} disabled={busy} className="border-red-300 text-red-600 hover:bg-red-50" data-testid="login-animation-off">
              <Power className="h-4 w-4 mr-1" />Turn off now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
