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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Home, Phone, PhoneCall, Loader2, AlertCircle, CheckCircle, Calendar as CalendarIcon, Quote, Package as PackageIcon, Building2, Construction, Sparkles, MapPin, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const publicAxios = axios.create({ withCredentials: false });
const URBAN_LOGO = 'https://customer-assets.emergentagent.com/job_10daf0a1-16d3-40c8-bdda-23bef46d5e3c/artifacts/d5w0bsh3_images.png';

// Mon-Sat, 10:00 AM – 6:00 PM, 30-min increments
const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 10; h < 18; h++) {
    for (const m of [0, 30]) {
      const label = (h > 12 ? h - 12 : h).toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
      const v = h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
      slots.push({ v, label });
    }
  }
  return slots;
})();

const getYoutubeThumb = (url) => {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
};

export default function PublicPackageView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [officeDialog, setOfficeDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('packages');

  useEffect(() => {
    setLoading(true);
    publicAxios.get(`${API}/public/package/${token}`)
      .then(r => setData(r.data))
      .catch(e => {
        const status = e?.response?.status;
        if (status === 410) setErr('This link has been revoked by the sales team.');
        else if (status === 404) setErr('Invalid or expired link. Please request a new one.');
        else setErr(e?.response?.data?.detail || 'Could not load this page.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Center><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></Center>;
  if (err) return (
    <Center>
      <Card className="max-w-md w-full"><CardContent className="py-10 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-800">Link unavailable</p>
        <p className="text-sm text-gray-500 mt-2">{err}</p>
      </CardContent></Card>
    </Center>
  );
  if (data?.expired) return <ExpiredView token={token} data={data} />;

  const sales = data?.sales_person || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 select-none" data-testid="public-package-view">
      <div className="max-w-md mx-auto min-h-screen flex flex-col relative">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-gray-500 leading-none">Welcome,</p>
              <p className="text-sm font-bold text-gray-800 leading-tight truncate">{data?.client_name || 'Valued Customer'}</p>
            </div>
            <img
              src={URBAN_LOGO}
              alt="Urban Space Builders"
              className="h-11 w-11 rounded-full shadow ring-2 ring-amber-200 shrink-0 object-contain bg-white"
              data-testid="urban-logo"
            />
          </div>
          <p className="text-[11px] text-amber-700 italic mt-2">"Pick the package that fits your dream home"</p>
        </header>

        {/* Scrollable content — pads for the two sticky bars at bottom */}
        <main className="flex-1 pb-[180px]">
          {activeTab === 'packages' && <PackagesNav packages={data?.packages || []} />}
          {activeTab === 'testimonials' && <div className="px-3 py-2"><TestimonialsNav testimonials={data?.testimonials || []} homeTours={data?.home_tours || []} /></div>}
          {activeTab === 'projects' && <div className="px-3 py-2"><ProjectsNav completed={data?.completed || []} ongoing={data?.ongoing || []} upcoming={data?.upcoming || []} /></div>}
        </main>

        {/* ============ STICKY BAR 1 — CTA buttons ============ */}
        <div className="fixed bottom-[64px] left-0 right-0 z-30 pointer-events-none">
          <div className="max-w-md mx-auto px-3 pb-2 space-y-2 pointer-events-auto">
            <Button
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl gap-2"
              onClick={() => setOfficeDialog(true)}
              data-testid="visit-office-btn"
            >
              <MapPin className="h-4 w-4" /> Visit our Office
            </Button>
            {sales?.phone && (
              <a href={`tel:${sales.phone}`} className="block">
                <Button variant="outline" className="w-full h-10 border-amber-600 text-amber-700 bg-white hover:bg-amber-50 gap-2 shadow-md" data-testid="package-call-sales-btn">
                  <PhoneCall className="h-4 w-4" /> Call {sales.name || 'Sales'} — {sales.phone}
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* ============ STICKY BAR 2 — Instagram-style bottom nav ============ */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <div className="max-w-md mx-auto grid grid-cols-3 h-16">
            <BottomTab
              active={activeTab === 'packages'}
              onClick={() => setActiveTab('packages')}
              icon={<PackageIcon className="h-5 w-5" />}
              label="Packages"
              testid="nav-packages"
            />
            <BottomTab
              active={activeTab === 'testimonials'}
              onClick={() => setActiveTab('testimonials')}
              icon={<Quote className="h-5 w-5" />}
              label="Testimonial"
              testid="nav-testimonials"
            />
            <BottomTab
              active={activeTab === 'projects'}
              onClick={() => setActiveTab('projects')}
              icon={<Building2 className="h-5 w-5" />}
              label="Our Projects"
              testid="nav-projects"
            />
          </div>
        </nav>

        <VisitOfficeDialog
          open={officeDialog}
          onOpenChange={setOfficeDialog}
          token={token}
          data={data}
          onBooked={() => { setOfficeDialog(false); toast.success('Office visit booked! Our team will reach out shortly.'); }}
        />
      </div>
    </div>
  );
}

function BottomTab({ active, onClick, icon, label, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`flex flex-col items-center justify-center gap-0.5 transition-all ${active ? 'text-amber-600' : 'text-gray-500 hover:text-gray-800'}`}
    >
      <div className={`transition-transform ${active ? 'scale-110' : 'scale-100'}`}>{icon}</div>
      <span className={`text-[10px] font-medium ${active ? 'font-bold' : ''}`}>{label}</span>
      {active && <div className="h-0.5 w-6 bg-amber-600 rounded-full absolute bottom-1" />}
    </button>
  );
}

function Center({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 flex items-center justify-center px-4">
      {children}
    </div>
  );
}

// ===================== Packages: 3 sub-tabs by name =====================
function PackagesNav({ packages }) {
  if (!packages || packages.length === 0) {
    return <div className="px-3 py-2"><Card><CardContent className="p-6 text-center text-sm text-gray-500">Packages not configured yet.</CardContent></Card></div>;
  }
  const defaultId = packages.find(p => p.is_popular)?.package_id || packages[0]?.package_id;
  return (
    <div className="px-3 py-2">
      <Tabs defaultValue={defaultId}>
        <TabsList className="w-full h-auto py-1 bg-white border sticky top-[72px] z-[5]" style={{ display: 'grid', gridTemplateColumns: `repeat(${packages.length}, minmax(0, 1fr))` }}>
          {packages.map(p => (
            <TabsTrigger
              key={p.package_id}
              value={p.package_id}
              className="text-[10px] py-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white"
              data-testid={`pkg-tab-${p.short_name?.toLowerCase().replace(/\s+/g, '-') || p.package_id}`}
            >
              <span className="flex items-center gap-1 min-w-0">
                {p.is_popular && <Sparkles className="h-3 w-3 shrink-0" />}
                <span className="truncate">{p.name}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {packages.map(p => (
          <TabsContent key={p.package_id} value={p.package_id} className="mt-2">
            <PackageCard pkg={p} />
          </TabsContent>
        ))}
      </Tabs>
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
            <div className="flex items-center justify-center gap-2 flex-wrap">
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

      <Accordion type="multiple" className="space-y-1.5 mt-2">
        {(pkg.sections || []).map((sec, i) => (
          <AccordionItem key={i} value={`s${i}`} className="bg-white border rounded-lg px-3">
            <AccordionTrigger className="hover:no-underline py-2.5 text-sm">
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

// ===================== Testimonials + Home Tour (2 inner tabs) =====================
function TestimonialsNav({ testimonials, homeTours }) {
  return (
    <Tabs defaultValue="testimonial">
      <TabsList className="grid grid-cols-2 w-full h-auto py-1 bg-white border sticky top-[72px] z-[5]">
        <TabsTrigger value="testimonial" className="text-[11px] py-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white" data-testid="inner-tab-testimonial">
          <Quote className="h-3 w-3 mr-1" /> Testimonial <span className="ml-1 opacity-70">({testimonials.length})</span>
        </TabsTrigger>
        <TabsTrigger value="home-tour" className="text-[11px] py-1.5 data-[state=active]:bg-purple-500 data-[state=active]:text-white" data-testid="inner-tab-home-tour">
          <Home className="h-3 w-3 mr-1" /> Home Tour <span className="ml-1 opacity-70">({homeTours.length})</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="testimonial" className="mt-2"><TestimonialsList items={testimonials} emptyLabel="Testimonials coming soon." /></TabsContent>
      <TabsContent value="home-tour" className="mt-2"><TestimonialsList items={homeTours} emptyLabel="Home tours coming soon." /></TabsContent>
    </Tabs>
  );
}

function TestimonialsList({ items, emptyLabel = 'Testimonials coming soon.' }) {
  if (!items || items.length === 0) {
    return <Card><CardContent className="p-6 text-center text-sm text-gray-500"><Quote className="h-10 w-10 text-amber-300 mx-auto mb-2" />{emptyLabel}</CardContent></Card>;
  }
  return (
    <div className="space-y-3">
      {items.map((t, i) => {
        const thumb = getYoutubeThumb(t.youtube_url);
        return (
          <Card key={t.id || i} className="bg-white overflow-hidden">
            {thumb && t.youtube_url && (
              <a href={t.youtube_url} target="_blank" rel="noopener noreferrer" className="block relative">
                <img src={thumb} alt={t.title} className="w-full h-40 object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                    <svg className="h-5 w-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
              </a>
            )}
            <CardContent className="p-3">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && <p className="text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{t.description}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ===================== Our Projects =====================
function ProjectsNav({ completed, ongoing, upcoming }) {
  return (
    <Tabs defaultValue="completed">
      <TabsList className="grid grid-cols-3 w-full h-auto py-1 bg-white border sticky top-[72px] z-[5]">
        <TabsTrigger value="completed" className="text-[10px] py-1.5 data-[state=active]:bg-emerald-500 data-[state=active]:text-white" data-testid="proj-tab-completed">
          <CheckCircle className="h-3 w-3 mr-1" /> Completed <span className="ml-1 opacity-70">({completed.length})</span>
        </TabsTrigger>
        <TabsTrigger value="ongoing" className="text-[10px] py-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white" data-testid="proj-tab-ongoing">
          <Construction className="h-3 w-3 mr-1" /> Ongoing <span className="ml-1 opacity-70">({ongoing.length})</span>
        </TabsTrigger>
        <TabsTrigger value="upcoming" className="text-[10px] py-1.5 data-[state=active]:bg-purple-500 data-[state=active]:text-white" data-testid="proj-tab-upcoming">
          <Sparkles className="h-3 w-3 mr-1" /> Upcoming <span className="ml-1 opacity-70">({upcoming.length})</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="completed" className="mt-2"><ProjectGrid items={completed} emptyLabel="No completed projects yet." /></TabsContent>
      <TabsContent value="ongoing" className="mt-2"><ProjectGrid items={ongoing} emptyLabel="No ongoing projects yet." /></TabsContent>
      <TabsContent value="upcoming" className="mt-2"><ProjectGrid items={upcoming} emptyLabel="No upcoming projects yet." /></TabsContent>
    </Tabs>
  );
}

function ProjectGrid({ items, emptyLabel }) {
  if (!items || items.length === 0) {
    return <Card><CardContent className="p-6 text-center text-sm text-gray-500">{emptyLabel}</CardContent></Card>;
  }
  return (
    <div className="space-y-2.5">
      {items.map((p, i) => {
        const thumb = p.cover_image_url || getYoutubeThumb(p.youtube_url);
        return (
          <Card key={p.id || i} className="overflow-hidden bg-white">
            {thumb && <img src={thumb} alt={p.title} className="w-full h-40 object-cover" />}
            <CardContent className="p-3">
              <p className="text-sm font-semibold">{p.title}</p>
              {p.location && <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {p.location}</p>}
              {p.description && <p className="text-xs text-gray-600 mt-1 leading-relaxed">{p.description}</p>}
              {p.floor_config && p.floor_config !== 'all' && <Badge className="mt-1.5 bg-gray-100 text-gray-700 border-0 text-[10px]">{p.floor_config}</Badge>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ===================== Visit Office Dialog =====================
function VisitOfficeDialog({ open, onOpenChange, token, data, onBooked }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [requirement, setRequirement] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && data) {
      setName(data.client_name || '');
      setPhone(data.client_phone || '');
      setEmail(data.client_email || '');
      setRequirement(data.client_requirement || '');
      setDate(''); setTime('');
    }
  }, [open, data]);

  const minDate = new Date().toISOString().split('T')[0];

  const handleSubmit = async () => {
    if (!date || !time) { toast.error('Pick a date and time'); return; }
    const d = new Date(date);
    if (d.getDay() === 0) { toast.error('Office is closed on Sundays — please pick Mon-Sat.'); return; }
    setSubmitting(true);
    try {
      await publicAxios.post(`${API}/public/package/${token}/book-office-visit`, {
        appointment_date: date,
        appointment_time: time,
        requirement: requirement.trim(),
      });
      onBooked && onBooked();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not book the visit');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="visit-office-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-600" /> Visit our Office</DialogTitle>
          <p className="text-xs text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Mon-Sat, 10:00 AM – 6:00 PM. We'll call to confirm.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Your Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} readOnly={!!data?.client_name} className={data?.client_name ? 'bg-gray-50' : ''} data-testid="office-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} readOnly={!!data?.client_phone} className={data?.client_phone ? 'bg-gray-50' : ''} data-testid="office-phone-input" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} readOnly={!!data?.client_email} className={data?.client_email ? 'bg-gray-50' : ''} data-testid="office-email-input" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Requirement / Notes</Label>
            <Textarea value={requirement} onChange={e => setRequirement(e.target.value)} rows={2} placeholder="e.g. 1500 sqft G+1 in Perumbakkam" data-testid="office-req-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} min={minDate} data-testid="office-date-input" />
              <p className="text-[10px] text-gray-400 mt-0.5">Mon-Sat only</p>
            </div>
            <div>
              <Label className="text-xs">Time Slot <span className="text-red-500">*</span></Label>
              <select value={time} onChange={e => setTime(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" data-testid="office-time-select">
                <option value="">— Pick a slot —</option>
                {TIME_SLOTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">10 AM – 6 PM</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={handleSubmit} disabled={submitting} data-testid="office-submit-btn">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : <><CalendarIcon className="h-4 w-4" /> Confirm Visit</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Expired =====================
function ExpiredView({ token, data }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 px-4 py-6" data-testid="public-package-expired">
      <div className="max-w-md mx-auto space-y-3">
        <Card><CardContent className="py-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-gray-800">Link Unavailable</p>
          <p className="text-sm text-gray-500 mt-2">Please connect with our sales team.</p>
        </CardContent></Card>
        {data?.sales_person?.phone && (
          <Card className="border-2 border-emerald-200 bg-emerald-50/40"><CardContent className="p-4">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase mb-2">Your Sales Executive</p>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg font-bold">
                {(data.sales_person.name?.[0] || 'S').toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">{data.sales_person.name}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" /> {data.sales_person.phone}</p>
              </div>
            </div>
            <a href={`tel:${data.sales_person.phone}`} className="block mt-3">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"><PhoneCall className="h-4 w-4" /> Call Now</Button>
            </a>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
