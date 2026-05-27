import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Bell, Check, CheckCheck, Search, Inbox, Filter, ChevronRight,
  CheckCircle2, XCircle, Banknote, FileText, Hammer, ShieldCheck,
  AlertTriangle, Building2, Mail, Clock, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Topic → icon + tone mapping
const TOPIC_STYLE = [
  { match: /reject|denied|fail/i,                    icon: XCircle,         tone: 'red',     label: 'Rejection' },
  { match: /approve|approved|completed/i,            icon: CheckCircle2,    tone: 'emerald', label: 'Approval'  },
  { match: /payment|paid|released|cash|rab|advance/i,icon: Banknote,        tone: 'amber',   label: 'Payment'   },
  { match: /estimate|fe |rough|final/i,              icon: FileText,        tone: 'indigo',  label: 'Estimate'  },
  { match: /labour|rab|stage/i,                      icon: Hammer,          tone: 'orange',  label: 'Labour'    },
  { match: /qc|quality|inspection/i,                 icon: ShieldCheck,     tone: 'cyan',    label: 'QC'        },
  { match: /client|share|sent/i,                     icon: Mail,            tone: 'violet',  label: 'Client'    },
  { match: /project|site/i,                          icon: Building2,       tone: 'blue',    label: 'Project'   },
];

const styleFor = (notif) => {
  const text = `${notif.title || ''} ${notif.message || ''} ${notif.type || ''}`;
  for (const t of TOPIC_STYLE) if (t.match.test(text)) return t;
  return { icon: Bell, tone: 'gray', label: 'General' };
};

const toneClasses = (tone) => ({
  bg: { red:'bg-red-50', emerald:'bg-emerald-50', amber:'bg-amber-50', indigo:'bg-indigo-50', orange:'bg-orange-50', cyan:'bg-cyan-50', violet:'bg-violet-50', blue:'bg-blue-50', gray:'bg-gray-100' }[tone] || 'bg-gray-100',
  text:{ red:'text-red-600', emerald:'text-emerald-600', amber:'text-amber-600', indigo:'text-indigo-600', orange:'text-orange-600', cyan:'text-cyan-600', violet:'text-violet-600', blue:'text-blue-600', gray:'text-gray-500' }[tone] || 'text-gray-500',
  ring:{ red:'ring-red-200', emerald:'ring-emerald-200', amber:'ring-amber-200', indigo:'ring-indigo-200', orange:'ring-orange-200', cyan:'ring-cyan-200', violet:'ring-violet-200', blue:'ring-blue-200', gray:'ring-gray-200' }[tone] || 'ring-gray-200',
  badge:{ red:'bg-red-100 text-red-700 border-red-200', emerald:'bg-emerald-100 text-emerald-700 border-emerald-200', amber:'bg-amber-100 text-amber-700 border-amber-200', indigo:'bg-indigo-100 text-indigo-700 border-indigo-200', orange:'bg-orange-100 text-orange-700 border-orange-200', cyan:'bg-cyan-100 text-cyan-700 border-cyan-200', violet:'bg-violet-100 text-violet-700 border-violet-200', blue:'bg-blue-100 text-blue-700 border-blue-200', gray:'bg-gray-100 text-gray-700 border-gray-200' }[tone] || 'bg-gray-100 text-gray-700 border-gray-200',
});

function timeAgo(iso) {
  if (!iso) return '';
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');   // all | unread | today
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [userRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/notifications`),
      ]);
      setUser(userRes.data);
      setNotifications(Array.isArray(notifsRes.data) ? notifsRes.data : []);
    } catch (e) { /* swallow */ }
    finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 20000);

  const handleMarkRead = async (notif) => {
    try {
      await axios.patch(`${API}/notifications/${notif.notification_id}/read`);
      setNotifications(prev => prev.map(n => n.notification_id === notif.notification_id ? { ...n, read: true } : n));
    } catch { toast.error('Failed to update'); }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) { toast.info('All notifications already read'); return; }
    try {
      await Promise.all(unread.map(n => axios.patch(`${API}/notifications/${n.notification_id}/read`).catch(() => null)));
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success(`Marked ${unread.length} as read`);
    } catch { toast.error('Some updates failed'); }
  };

  const handleOpen = (notif) => {
    if (!notif.read) handleMarkRead(notif);
    if (notif.link) window.location.href = notif.link;
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const todayCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return notifications.filter(n => new Date(n.created_at) >= today).length;
  }, [notifications]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter(n => {
      if (filter === 'unread' && n.read) return false;
      if (filter === 'today') {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (new Date(n.created_at) < today) return false;
      }
      if (q && !(`${n.title || ''} ${n.message || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [notifications, filter, search]);

  // Group by date label
  const grouped = useMemo(() => {
    const groups = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    filtered.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= today) groups.Today.push(n);
      else if (d >= yesterday) groups.Yesterday.push(n);
      else if (d >= weekAgo) groups['This Week'].push(n);
      else groups.Earlier.push(n);
    });
    return groups;
  }, [filtered]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white rounded-lg border p-12 text-center">
            <Bell className="h-8 w-8 mx-auto text-gray-300 animate-pulse" />
            <p className="text-sm text-gray-500 mt-2">Loading notifications…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white" data-testid="notifications-page">
      <AppHeader user={user} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {/* HERO */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 data-testid="notifications-title" className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <span className="relative">
                <Bell className="h-6 w-6 text-amber-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </span>
              Inbox
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Real-time approvals, payments, and project updates.</p>
          </div>
          <Button
            data-testid="mark-all-read-btn"
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="gap-2 self-start sm:self-auto"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
            {unreadCount > 0 && <Badge variant="secondary" className="ml-1">{unreadCount}</Badge>}
          </Button>
        </div>

        {/* STAT TILES */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs uppercase tracking-wide text-blue-700 font-medium">Total</span>
                <Inbox className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-900 mt-1" data-testid="notif-stat-total">{notifications.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs uppercase tracking-wide text-amber-700 font-medium">Unread</span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-900 mt-1" data-testid="notif-stat-unread">{unreadCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs uppercase tracking-wide text-emerald-700 font-medium">Today</span>
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-900 mt-1" data-testid="notif-stat-today">{todayCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* FILTERS + SEARCH */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="flex gap-1 bg-white border rounded-lg p-1" data-testid="notif-filters">
            {[
              { v: 'all', label: 'All', count: notifications.length },
              { v: 'unread', label: 'Unread', count: unreadCount },
              { v: 'today', label: 'Today', count: todayCount },
            ].map(({ v, label, count }) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                data-testid={`notif-filter-${v}`}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium flex items-center gap-1 transition-colors ${filter === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${filter === v ? 'bg-white/20' : 'bg-gray-200 text-gray-700'}`}>{count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search title or message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="notif-search"
            />
          </div>
        </div>

        {/* NOTIFICATIONS LIST */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Inbox className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">{notifications.length === 0 ? 'No notifications yet' : 'Nothing matches your filters'}</p>
              <p className="text-xs text-gray-500 mt-1">{notifications.length === 0 ? "You'll see project updates, approvals, and alerts here." : 'Try changing the filter or clearing the search.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([label, items]) => items.length === 0 ? null : (
              <section key={label} data-testid={`notif-group-${label.toLowerCase().replace(' ', '-')}`}>
                <h2 className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2 flex items-center gap-2">
                  <Filter className="h-3 w-3" /> {label}
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-400">{items.length}</span>
                </h2>
                <Card className="overflow-hidden">
                  <ul className="divide-y" >
                    {items.map((n) => {
                      const { icon: Icon, tone, label: topic } = styleFor(n);
                      const tc = toneClasses(tone);
                      return (
                        <li
                          key={n.notification_id}
                          onClick={() => handleOpen(n)}
                          data-testid={`notif-${n.notification_id}`}
                          className={`group p-3 sm:p-4 flex items-start gap-3 cursor-pointer transition-colors ${!n.read ? 'bg-gradient-to-r from-amber-50/60 to-transparent' : 'hover:bg-gray-50'}`}
                        >
                          <div className={`h-10 w-10 rounded-full ${tc.bg} flex items-center justify-center ring-2 ${tc.ring} shrink-0`}>
                            <Icon className={`h-5 w-5 ${tc.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`text-sm sm:text-[15px] font-semibold ${!n.read ? 'text-gray-900' : 'text-gray-700'} truncate`}>{n.title}</h3>
                              <Badge variant="outline" className={`text-[10px] py-0 h-4 ${tc.badge}`}>{topic}</Badge>
                              {!n.read && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                            </div>
                            <p className={`text-xs sm:text-sm mt-0.5 ${!n.read ? 'text-gray-700' : 'text-gray-500'} line-clamp-2`}>{n.message}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {timeAgo(n.created_at)}</span>
                              {!n.read && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMarkRead(n); }}
                                  className="inline-flex items-center gap-1 hover:text-amber-700"
                                  data-testid={`notif-mark-read-${n.notification_id}`}
                                >
                                  <Check className="h-2.5 w-2.5" /> Mark as read
                                </button>
                              )}
                            </div>
                          </div>
                          {n.link && (
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0 self-center" />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
