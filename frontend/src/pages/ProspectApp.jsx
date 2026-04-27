import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { FileText, Sparkles, PhoneCall, Loader2, Building2, MapPin, Phone, Play } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

// Block right-click + copy + drag (deters casual screenshots/copying — 100% prevention is impossible).
function attachQuoteGuard(ref) {
  if (!ref) return;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
  ref.addEventListener('contextmenu', stop);
  ref.addEventListener('copy', stop);
  ref.addEventListener('dragstart', stop);
}

export default function ProspectApp() {
  const [tab, setTab] = useState('quote');
  const [me, setMe] = useState(null);

  useEffect(() => {
    axios.get(`${API}/prospect/me`).then(r => setMe(r.data)).catch(() => {});
  }, []);

  const name = me?.user?.name || 'there';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 select-none">
      {/* Mobile container */}
      <div className="max-w-md mx-auto pb-20 min-h-screen flex flex-col">
        {/* Sticky header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
              {(name[0] || 'P').toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] text-gray-500 leading-none">Welcome back,</p>
              <p className="text-sm font-bold text-gray-800 leading-tight">{name}</p>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[11px] text-amber-700 italic">"Let's go through your stress-free construction quote"</p>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-3">
          {tab === 'quote' && <MyQuoteTab onCallSales={() => setTab('build')} sales={me?.sales_person} attachGuard={attachQuoteGuard} />}
          {tab === 'inspire' && <InspirationTab />}
          {tab === 'build' && <LetsBuildTab sales={me?.sales_person} />}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-20">
          <div className="max-w-md mx-auto grid grid-cols-3 px-2">
            {[
              { k: 'quote', label: 'My Quote', Icon: FileText },
              { k: 'inspire', label: 'Inspire', Icon: Sparkles },
              { k: 'build', label: "Build Now", Icon: PhoneCall },
            ].map(({ k, label, Icon }) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${tab === k ? 'text-emerald-700' : 'text-gray-400 hover:text-gray-600'}`}
                data-testid={`prospect-nav-${k}`}
              >
                <Icon className={`h-5 w-5 ${tab === k ? 'fill-emerald-100' : ''}`} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

// ============ Tab 1: My Quote ============
function MyQuoteTab({ sales, attachGuard }) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/prospect/my-quote`)
      .then(r => setQuote(r.data))
      .catch(e => setErr(e?.response?.data?.detail || 'Failed to load quote'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading quote…</div>;
  if (err) return (
    <Card className="bg-amber-50 border-amber-200">
      <CardContent className="p-4 text-center text-sm">
        <p className="font-medium text-amber-800">{err}</p>
        <p className="text-[11px] text-amber-600 mt-1">Your assigned sales executive will reach out shortly.</p>
      </CardContent>
    </Card>
  );

  const re = quote?.re_project || {};
  const est = quote?.estimate || {};

  return (
    <div className="space-y-3 quote-guard" ref={attachGuard} style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      {/* Cover */}
      <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0 shadow-lg">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider opacity-80">Your Stress-Free Quote</p>
          <p className="text-lg font-bold mt-1">{re.project_name || re.client_name || 'Your Dream Home'}</p>
          {re.floor_config && <Badge className="bg-white/20 text-white border-0 mt-2">{re.floor_config}</Badge>}
          {est.total_value > 0 && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <p className="text-[11px] opacity-80">Approved Estimate</p>
              <p className="text-2xl font-bold">{fmt(est.total_value)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      {est.items && est.items.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Inclusions</p>
            <div className="divide-y">
              {est.items.map((it, i) => (
                <div key={it.item_id || i} className="py-2 flex items-start justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-[11px] text-gray-500">{it.qty} {it.unit} × {fmt(it.amount)}{it.remarks ? ` · ${it.remarks}` : ''}</p>
                  </div>
                  <p className="font-semibold text-emerald-700 whitespace-nowrap">{fmt(it.total)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t flex items-center justify-between">
              <span className="text-sm font-bold">Total</span>
              <span className="text-lg font-extrabold text-emerald-700">{fmt(est.total_value)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval badge */}
      {quote?.approved_at && (
        <p className="text-[11px] text-center text-gray-400">✓ Approved by management on {new Date(quote.approved_at).toLocaleDateString('en-IN')}</p>
      )}

      {/* Bottom CTA — Call Sales */}
      {sales?.phone && (
        <a href={`tel:${sales.phone}`} className="block">
          <Button className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white shadow-lg gap-2" data-testid="quote-call-sales-btn">
            <PhoneCall className="h-4 w-4" /> Call {sales.name || 'Sales'} — {sales.phone}
          </Button>
        </a>
      )}
    </div>
  );
}

// ============ Tab 2: Inspiration ============
function InspirationTab() {
  const [data, setData] = useState({ testimonials: [], completed: [], ongoing: [] });
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState('testimonials');

  useEffect(() => {
    axios.get(`${API}/prospect/inspiration`).then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const items = data[sub] || [];

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-full p-1">
        {[
          { k: 'testimonials', l: 'Testimonials' },
          { k: 'completed', l: 'Completed' },
          { k: 'ongoing', l: 'Ongoing' },
        ].map(({ k, l }) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`flex-1 text-[11px] font-medium px-3 py-1.5 rounded-full transition-all ${sub === k ? 'bg-white shadow text-emerald-700' : 'text-gray-500'}`}
            data-testid={`inspire-sub-${k}`}
          >
            {l} <span className="ml-0.5 opacity-60">({(data[k] || []).length})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400 text-sm">No content yet — your sales team will add some shortly.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map(it => <ShowcaseCard key={it.id} item={it} />)}
        </div>
      )}
    </div>
  );
}

function getYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function ShowcaseCard({ item }) {
  const [playing, setPlaying] = useState(false);
  const ytId = getYouTubeId(item.youtube_url);
  const thumb = item.cover_image_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);
  return (
    <Card className="overflow-hidden shadow-md">
      {ytId ? (
        playing ? (
          <div className="aspect-video">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
              title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <button onClick={() => setPlaying(true)} className="block w-full text-left relative" data-testid={`showcase-play-${item.id}`}>
            <img src={thumb} alt={item.title} className="w-full aspect-video object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
              <div className="h-14 w-14 rounded-full bg-red-600 flex items-center justify-center shadow-xl">
                <Play className="h-7 w-7 text-white fill-white ml-1" />
              </div>
            </div>
          </button>
        )
      ) : thumb ? (
        <img src={thumb} alt={item.title} className="w-full aspect-video object-cover" />
      ) : null}
      <CardContent className="p-3">
        <p className="font-semibold text-sm">{item.title}</p>
        {item.location && <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {item.location}</p>}
        {item.description && <p className="text-[11px] text-gray-600 mt-1 line-clamp-3">{item.description}</p>}
      </CardContent>
    </Card>
  );
}

// ============ Tab 3: Let's Build Now ============
function LetsBuildTab({ sales }) {
  return (
    <div className="space-y-4 py-3">
      <div className="text-center pt-4">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-amber-500 text-white shadow-xl mb-3">
          <Building2 className="h-10 w-10" />
        </div>
        <p className="text-2xl font-extrabold text-gray-800 leading-tight">Urban Space</p>
        <p className="text-[11px] text-gray-500 uppercase tracking-widest">Builders</p>
      </div>

      <Card className="border-2 border-dashed border-emerald-300 bg-emerald-50/50">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-emerald-700 font-semibold uppercase">Your Personal Sales Executive</p>
          <div className="my-3 inline-flex h-16 w-16 rounded-full bg-emerald-600 text-white items-center justify-center text-2xl font-bold shadow-lg">
            {(sales?.name?.[0] || 'S').toUpperCase()}
          </div>
          <p className="text-base font-bold">{sales?.name || 'Sales Team'}</p>
          {sales?.phone && <p className="text-xs text-gray-500 flex items-center gap-1 justify-center mt-1"><Phone className="h-3 w-3" /> {sales.phone}</p>}
        </CardContent>
      </Card>

      {sales?.phone ? (
        <a href={`tel:${sales.phone}`} className="block">
          <Button className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-xl text-base gap-2" data-testid="build-call-btn">
            <PhoneCall className="h-5 w-5" /> Call to Sign the Project
          </Button>
        </a>
      ) : (
        <Card><CardContent className="py-6 text-center text-sm text-gray-400">Sales contact will be assigned shortly.</CardContent></Card>
      )}

      <p className="text-[10px] text-center text-gray-400 italic">Tap the button above to call your sales executive directly.</p>
    </div>
  );
}
