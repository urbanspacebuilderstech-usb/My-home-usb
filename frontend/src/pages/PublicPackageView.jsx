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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Home, Phone, PhoneCall, Loader2, AlertCircle, CheckCircle, Clock, Calendar as CalendarIcon, Star, Quote, Package as PackageIcon } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const publicAxios = axios.create({ withCredentials: false });

export default function PublicPackageView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    publicAxios.get(`${API}/public/package/${token}`)
      .then(r => setData(r.data))
      .catch(e => {
        const status = e?.response?.status;
        if (status === 410) setErr('This link has been revoked by the sales team.');
        else if (status === 404) setErr('Invalid or expired link. Please request a new one from your sales executive.');
        else setErr(e?.response?.data?.detail || 'Could not load this page.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
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
  if (data?.expired) return <ExpiredView token={token} data={data} />;
  return <LiveView token={token} data={data} />;
}

// ============ Live: 3 tabs ============
function LiveView({ token, data }) {
  const sales = data?.sales_person || {};
  const expiresAt = data?.expires_at ? new Date(data.expires_at) : null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 select-none" data-testid="public-package-view">
      <div className="max-w-md mx-auto pb-24 min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] text-gray-500 leading-none">Welcome,</p>
              <p className="text-sm font-bold text-gray-800 leading-tight">{data?.client_name || 'Valued Customer'}</p>
            </div>
            {daysLeft !== null && (
              <Badge className={`${daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} border-0`}>
                <Clock className="h-3 w-3 mr-1" /> {daysLeft}d left
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-amber-700 italic mt-2">"Pick the package that fits your dream home"</p>
        </header>

        <Tabs defaultValue="packages" className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-3 mx-3 mt-2 bg-amber-100/60">
            <TabsTrigger value="packages" data-testid="tab-packages">
              <PackageIcon className="h-3.5 w-3.5 mr-1" /> Packages
            </TabsTrigger>
            <TabsTrigger value="testimonials" data-testid="tab-testimonials">
              <Quote className="h-3.5 w-3.5 mr-1" /> Reviews
            </TabsTrigger>
            <TabsTrigger value="appointment" data-testid="tab-appointment">
              <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Book
            </TabsTrigger>
          </TabsList>

          <TabsContent value="packages" className="mt-2">
            <PackagesTab packages={data?.packages || []} />
          </TabsContent>

          <TabsContent value="testimonials" className="mt-2">
            <TestimonialsTab testimonials={data?.testimonials || []} completed={data?.completed || []} />
          </TabsContent>

          <TabsContent value="appointment" className="mt-2">
            <AppointmentTab token={token} sales={sales} prefillName={data?.client_name} prefillPhone={data?.client_phone} />
          </TabsContent>
        </Tabs>

        {sales?.phone && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-20">
            <div className="max-w-md mx-auto p-3">
              <a href={`tel:${sales.phone}`} className="block">
                <Button className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white shadow-lg gap-2" data-testid="package-call-sales-btn">
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

function PackagesTab({ packages }) {
  const [selected, setSelected] = useState(packages?.[packages.length - 1]?.package_id || packages?.[0]?.package_id || null);
  const pkg = packages.find(p => p.package_id === selected) || packages[0];

  if (!packages || packages.length === 0) {
    return (
      <Card><CardContent className="p-6 text-center text-sm text-gray-500">Packages not configured yet.</CardContent></Card>
    );
  }

  return (
    <div className="px-3 space-y-3">
      {/* Dropdown selector — like the screenshot */}
      <Card className="bg-white">
        <CardContent className="p-3">
          <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Select a Package</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="mt-1.5 h-12" data-testid="package-select">
              <SelectValue placeholder="Choose a package" />
            </SelectTrigger>
            <SelectContent>
              {packages.map(p => (
                <SelectItem key={p.package_id} value={p.package_id} data-testid={`package-option-${p.short_name?.toLowerCase().replace(/\s+/g,'-')}`}>
                  <span className="flex items-center gap-2">
                    <Home className="h-3.5 w-3.5 text-amber-600" />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-amber-600">— ₹{p.price_per_sqft}/sqft</span>
                    {p.is_popular && <Badge className="bg-amber-500 text-white border-0 text-[9px] ml-1">Popular</Badge>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {pkg && <PackageCard pkg={pkg} />}
    </div>
  );
}

function PackageCard({ pkg }) {
  const hasDiscount = pkg.original_price_per_sqft && pkg.original_price_per_sqft > pkg.price_per_sqft;
  return (
    <>
      <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-4 pt-5 pb-3 text-center">
            <Home className="h-7 w-7 text-amber-600 mx-auto mb-2" />
            <p className="text-base font-bold text-gray-800">{pkg.name}</p>
            {pkg.is_popular && <Badge className="bg-red-500 text-white border-0 mt-1">Most Popular</Badge>}
          </div>
          <div className="bg-amber-400 px-4 py-5 text-center">
            <div className="flex items-center justify-center gap-2">
              {hasDiscount && <span className="text-lg text-gray-700 line-through">₹{pkg.original_price_per_sqft}/-</span>}
              <span className="text-3xl font-extrabold text-gray-900">₹{pkg.price_per_sqft}/-</span>
            </div>
            <p className="text-[11px] text-white opacity-95 mt-1">Per Sq.ft</p>
          </div>
          <div className="p-4 bg-white">
            <p className="text-[11px] uppercase tracking-wider text-amber-600 font-bold text-center mb-1">{pkg.short_name || pkg.name}</p>
            <p className="text-center text-base font-bold text-gray-800">₹{pkg.price_per_sqft}/-</p>
          </div>
        </CardContent>
      </Card>

      <Accordion type="multiple" className="space-y-1.5" data-testid="package-sections">
        {(pkg.sections || []).map((sec, i) => (
          <AccordionItem key={i} value={`s${i}`} className="bg-white border rounded-lg px-3">
            <AccordionTrigger className="hover:no-underline py-2.5 text-sm" data-testid={`package-section-${i}`}>
              <div className="flex items-center gap-2 text-left">
                <Home className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="font-medium">{sec.title}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-0 pb-3">
              <ul className="space-y-1.5 text-xs text-gray-700">
                {(sec.bullets || []).map((b, j) => (
                  <li key={j} className="flex items-start gap-1.5">
                    <CheckCircle className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

function TestimonialsTab({ testimonials, completed }) {
  if ((!testimonials || testimonials.length === 0) && (!completed || completed.length === 0)) {
    return (
      <Card className="mx-3"><CardContent className="p-6 text-center">
        <Star className="h-10 w-10 text-amber-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Reviews & success stories coming soon.</p>
      </CardContent></Card>
    );
  }
  return (
    <div className="px-3 space-y-3">
      {testimonials.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-amber-700 font-bold mt-1">What Our Clients Say</p>
          {testimonials.map((t, i) => (
            <Card key={t.showcase_id || i} className="bg-white">
              <CardContent className="p-4">
                <Quote className="h-5 w-5 text-amber-400 mb-1" />
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{t.description || t.title}</p>
                {(t.client_name || t.title) && (
                  <p className="text-xs text-amber-600 mt-2 font-semibold">— {t.client_name || t.title}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
      {completed.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold mt-2">Completed Projects</p>
          {completed.slice(0, 6).map((c, i) => (
            <Card key={c.showcase_id || i} className="bg-white">
              <CardContent className="p-3">
                {c.image_url && <img src={c.image_url} alt="" className="w-full h-36 object-cover rounded mb-2" />}
                <p className="text-sm font-semibold">{c.title}</p>
                {c.description && <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{c.description}</p>}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function AppointmentTab({ token, sales, prefillName, prefillPhone }) {
  const [name, setName] = useState(prefillName || '');
  const [phone, setPhone] = useState(prefillPhone || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [requirement, setRequirement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) { toast.error('Name and phone are required'); return; }
    if (!date || !time) { toast.error('Pick a date and time'); return; }
    setSubmitting(true);
    try {
      const r = await publicAxios.post(`${API}/public/package/${token}/book-appointment`, {
        name: name.trim(), phone: phone.trim(),
        appointment_date: date, appointment_time: time, requirement: requirement.trim(),
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
      <div className="px-3 mt-2">
        <Card><CardContent className="py-10 text-center">
          <CheckCircle className="h-14 w-14 text-emerald-600 mx-auto mb-3" />
          <p className="text-lg font-semibold text-gray-800">Appointment Booked!</p>
          <p className="text-sm text-gray-500 mt-2">{sales.name || 'Your sales executive'} will reach out shortly.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="px-3 space-y-3">
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold">Book a Consultation</p>
        </div>
        <p className="text-[11px] text-gray-500">Pick a slot — we'll confirm via call.</p>

        <div>
          <Label className="text-xs">Your Name <span className="text-red-500">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-testid="pkg-appt-name-input" />
        </div>
        <div>
          <Label className="text-xs">Phone <span className="text-red-500">*</span></Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" data-testid="pkg-appt-phone-input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} data-testid="pkg-appt-date-input" />
          </div>
          <div>
            <Label className="text-xs">Time <span className="text-red-500">*</span></Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="pkg-appt-time-input" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Requirement / Notes</Label>
          <Textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder="e.g. interested in Builder's Choice for 1500 sqft G+1" rows={3} data-testid="pkg-appt-req-input" />
        </div>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-amber-600 hover:bg-amber-700 gap-2" data-testid="pkg-appt-submit-btn">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : <><CalendarIcon className="h-4 w-4" /> Confirm Appointment</>}
        </Button>
      </CardContent></Card>
    </div>
  );
}

// ============ Expired ============
function ExpiredView({ token, data }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 px-4 py-6" data-testid="public-package-expired">
      <div className="max-w-md mx-auto space-y-3">
        <Card>
          <CardContent className="py-6 text-center">
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-800">Link Expired</p>
            <p className="text-sm text-gray-500 mt-2">This package link has expired. Please connect with our sales team for fresh details.</p>
          </CardContent>
        </Card>

        {data?.sales_person?.phone && (
          <Card className="border-2 border-emerald-200 bg-emerald-50/40">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase mb-2">Your Sales Executive</p>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg font-bold shadow">
                  {(data.sales_person.name?.[0] || 'S').toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{data.sales_person.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" /> {data.sales_person.phone}</p>
                </div>
              </div>
              <a href={`tel:${data.sales_person.phone}`} className="block mt-3">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2" data-testid="expired-call-btn">
                  <PhoneCall className="h-4 w-4" /> Call Now
                </Button>
              </a>
            </CardContent>
          </Card>
        )}

        <AppointmentTab token={token} sales={data?.sales_person || {}} prefillName={data?.client_name} prefillPhone={data?.client_phone} />
      </div>
    </div>
  );
}
