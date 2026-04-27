import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { FileText, PhoneCall, Loader2, MapPin, Phone, Calendar as CalendarIcon, CheckCircle, Clock, AlertCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

// Public axios — does NOT send cookies (avoids accidental auth interaction).
const publicAxios = axios.create({ withCredentials: false });

export default function PublicQuoteView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    publicAxios.get(`${API}/public/quote/${token}`)
      .then(r => setData(r.data))
      .catch(e => {
        const status = e?.response?.status;
        if (status === 410) setErr('This quote link has been revoked by the sales team.');
        else if (status === 404) setErr('Invalid or expired link. Please request a new one from your sales executive.');
        else setErr(e?.response?.data?.detail || 'Could not load this quote.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto" />
          <p className="text-sm text-gray-500 mt-3">Loading your quote…</p>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-base font-semibold text-gray-800">Link unavailable</p>
            <p className="text-sm text-gray-500 mt-2">{err}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data?.expired) {
    return <ExpiredView token={token} data={data} />;
  }

  return <QuoteView data={data} />;
}

// ============ Live: full quote ============
function QuoteView({ data }) {
  const re = data?.re_project || {};
  const totalValue = Number(re.estimated_total || re.total_value || 0);
  const scopeItems = Array.isArray(re.rough_scope_items) ? re.rough_scope_items : [];
  const requirementText = re.rough_requirement || re.requirement_summary || '';
  const buildingType = re.building_type || re.config_type || re.floor_config;
  const projectTitle = re.project_name || re.client_name || data?.client_name || 'Your Dream Home';
  const sqft = re.sqft || re.area_sqft;
  const months = re.handover_months;
  const ratePerSqft = sqft && totalValue ? Math.round(totalValue / sqft) : null;
  const sales = data?.sales_person || {};
  const expiresAt = data?.expires_at ? new Date(data.expires_at) : null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 select-none" data-testid="public-quote-view">
      <div className="max-w-md mx-auto pb-24 min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] text-gray-500 leading-none">Welcome,</p>
              <p className="text-sm font-bold text-gray-800 leading-tight">{data?.client_name || 'Valued Customer'}</p>
            </div>
            {daysLeft !== null && (
              <Badge className={`${daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} border-0`} data-testid="quote-expiry-chip">
                <Clock className="h-3 w-3 mr-1" /> {daysLeft}d left
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-amber-700 italic mt-2">"Your stress-free construction quote"</p>
        </header>

        <main className="flex-1 px-4 py-3 space-y-3" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
          <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider opacity-80">Your Stress-Free Quote</p>
              <p className="text-lg font-bold mt-1">{projectTitle}</p>
              {(re.location || re.address) && (
                <div className="mt-1 flex items-center gap-1 opacity-90">
                  <MapPin className="h-3 w-3" />
                  <p className="text-[12px]">{re.location || re.address}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {buildingType && <Badge className="bg-white/20 text-white border-0">{buildingType}</Badge>}
                {sqft > 0 && <Badge className="bg-white/20 text-white border-0">{sqft} sqft</Badge>}
                {months && <Badge className="bg-white/20 text-white border-0">{months} mo handover</Badge>}
                {re.re_number && <Badge className="bg-white/20 text-white border-0">{re.re_number}</Badge>}
              </div>
              {totalValue > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20">
                  <p className="text-[11px] opacity-80">Approved Estimate</p>
                  <p className="text-3xl font-extrabold tracking-tight">{fmt(totalValue)}</p>
                  {ratePerSqft && <p className="text-[11px] opacity-80 mt-0.5">≈ {fmt(ratePerSqft)} per sqft</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Project Details</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Client', re.client_name || data?.client_name],
                  ['Building', buildingType],
                  ['Built-up Area', sqft ? `${sqft} sqft` : null],
                  ['Handover', months ? `${months} months` : null],
                  ['RE Number', re.re_number ? `${re.re_number}${re.revision ? ` · Rev ${re.revision}` : ''}` : null],
                  ['Location', re.location],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-2">
                    <p className="text-[10px] text-gray-500 uppercase">{k}</p>
                    <p className="text-sm font-medium text-gray-800 truncate">{v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {requirementText && typeof requirementText === 'string' && (
            <Card>
              <CardContent className="p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Project Requirement</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{requirementText}</p>
              </CardContent>
            </Card>
          )}

          {scopeItems.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Inclusions</p>
                <div className="divide-y">
                  {scopeItems.map((it, i) => {
                    const qty = it.qty || it.quantity;
                    const rate = it.amount || it.rate;
                    const total = it.total || (qty && rate ? Number(qty) * Number(rate) : 0);
                    return (
                      <div key={it.item_id || i} className="py-2 flex items-start justify-between gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{it.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {qty && <>{qty} {it.unit || ''}</>}
                            {rate ? ` × ${fmt(rate)}` : ''}
                            {it.remarks ? ` · ${it.remarks}` : ''}
                          </p>
                        </div>
                        <p className="font-semibold text-emerald-700 whitespace-nowrap">{fmt(total)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-2 border-t flex items-center justify-between">
                  <span className="text-sm font-bold">Total Estimate</span>
                  <span className="text-lg font-extrabold text-emerald-700">{fmt(totalValue)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-3">
              <p className="text-[11px] font-semibold text-amber-700 uppercase mb-2">What's Included</p>
              <ul className="space-y-1.5 text-xs text-amber-800">
                {[
                  'Approved drawings & structural plans',
                  'Quality materials with brand options',
                  'Skilled labour managed end-to-end',
                  `On-time handover within ${months || 'agreed'} months`,
                  'Dedicated CRE & site engineer assigned',
                  'Real-time project tracking via mobile updates',
                ].map((line, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <CheckCircle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {data?.approved_at && (
            <p className="text-[11px] text-center text-gray-400">✓ Approved by management on {new Date(data.approved_at).toLocaleDateString('en-IN')}</p>
          )}
        </main>

        {sales?.phone && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-20">
            <div className="max-w-md mx-auto p-3">
              <a href={`tel:${sales.phone}`} className="block">
                <Button className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white shadow-lg gap-2" data-testid="quote-call-sales-btn">
                  <PhoneCall className="h-4 w-4" /> Call {sales.name || 'Sales'} — {sales.phone}
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Expired: contact + book appointment ============
function ExpiredView({ token, data }) {
  const sales = data?.sales_person || {};
  const [name, setName] = useState(data?.client_name || '');
  const [phone, setPhone] = useState(data?.client_phone || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!date || !time) {
      toast.error('Please pick a preferred date and time');
      return;
    }
    setSubmitting(true);
    try {
      const r = await publicAxios.post(`${API}/public/quote/${token}/book-appointment`, {
        name: name.trim(),
        phone: phone.trim(),
        appointment_date: date,
        appointment_time: time,
        notes: notes.trim(),
      });
      toast.success(r.data?.message || 'Appointment booked');
      setDone(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not book the appointment');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center">
            <CheckCircle className="h-14 w-14 text-emerald-600 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-800">Appointment Booked!</p>
            <p className="text-sm text-gray-500 mt-2">{sales.name || 'Your sales executive'} will reach out shortly to confirm.</p>
            {sales.phone && (
              <a href={`tel:${sales.phone}`} className="block mt-5">
                <Button variant="outline" className="gap-2"><PhoneCall className="h-4 w-4" /> Call {sales.phone}</Button>
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50" data-testid="public-quote-expired">
      <div className="max-w-md mx-auto pb-12 min-h-screen">
        <header className="bg-white/90 backdrop-blur border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <p className="text-base font-bold text-gray-800">Your Quote Has Expired</p>
          </div>
          <p className="text-xs text-gray-500 mt-1">It's been over 30 days since this quote was sent. Pricing & material costs may have changed — let's set up a fresh chat.</p>
        </header>

        <main className="px-4 py-4 space-y-3">
          {/* Sales contact */}
          <Card className="border-2 border-emerald-200 bg-emerald-50/40">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase mb-2">Your Sales Executive</p>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg font-bold shadow">
                  {(sales.name?.[0] || 'S').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{sales.name || 'Sales Team'}</p>
                  {sales.phone && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {sales.phone}
                    </p>
                  )}
                </div>
              </div>
              {sales.phone && (
                <a href={`tel:${sales.phone}`} className="block mt-3">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2" data-testid="expired-call-btn">
                    <PhoneCall className="h-4 w-4" /> Call Now
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>

          {/* Appointment form */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold">Book an Appointment</p>
              </div>
              <p className="text-[11px] text-gray-500">Pick a slot below — we'll get in touch to confirm.</p>

              <div>
                <Label className="text-xs">Your Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-testid="appt-name-input" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" data-testid="appt-phone-input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Preferred Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} data-testid="appt-date-input" />
                </div>
                <div>
                  <Label className="text-xs">Time</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="appt-time-input" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any specific requirements or questions" rows={3} data-testid="appt-notes-input" />
              </div>

              <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-amber-600 hover:bg-amber-700 gap-2" data-testid="appt-submit-btn">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : <><CalendarIcon className="h-4 w-4" /> Confirm Appointment</>}
              </Button>
            </CardContent>
          </Card>

          <p className="text-[10px] text-center text-gray-400 italic">We respect your privacy — only your sales executive sees this request.</p>
        </main>
      </div>
    </div>
  );
}
