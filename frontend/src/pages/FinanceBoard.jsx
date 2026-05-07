import { useState, useEffect } from 'react';
import axios from 'axios';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AppHeader } from '../components/AppHeader';
import { LineChart, BarChart3, CalendarClock, FolderKanban } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Each tab hosts the existing page in an iframe with `?embedded=1` so the
// inner page suppresses its own AppHeader (set per-page wherever supported).
// Iframe sandbox keeps cookies/auth flowing on same origin.
const TABS = [
  { value: 'accounts',  label: 'Accounts',         icon: BarChart3,    src: '/accounts-board?embedded=1&navRole=accountant' },
  { value: 'payments',  label: 'Payment Schedule', icon: CalendarClock, src: '/payment-schedule?embedded=1' },
  { value: 'projects',  label: 'Project Wise',     icon: FolderKanban,  src: '/accounts-board?tab=projects&embedded=1&navRole=accountant' },
  { value: 'projection', label: 'Projection',      icon: LineChart,     src: null },
];

export default function FinanceBoard() {
  const [user, setUser] = useState(null);
  const [active, setActive] = useState('accounts');

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(r => setUser(r.data))
      .catch(() => { window.location.href = '/login'; });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" data-testid="finance-board">
      <AppHeader user={user} />

      <Tabs value={active} onValueChange={setActive} className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 lg:px-6">
          <TabsList className="bg-transparent h-10 p-0 gap-1" data-testid="finance-board-tabs">
            {TABS.map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                data-testid={`fb-tab-${t.value}`}
                className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 data-[state=active]:shadow-none data-[state=active]:font-semibold rounded-md px-3 py-1.5 text-sm gap-1.5"
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value} className="flex-1 m-0 p-0">
            {t.src ? (
              <iframe
                title={t.label}
                src={t.src}
                data-testid={`fb-frame-${t.value}`}
                className="w-full border-0"
                style={{ height: 'calc(100vh - 6rem)' }}
              />
            ) : (
              <div data-testid="fb-projection-placeholder" className="h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <LineChart className="h-12 w-12 text-gray-300 mb-3" />
                <h3 className="text-base font-semibold text-gray-700">Projection</h3>
                <p className="text-sm text-gray-500 mt-1 max-w-md">
                  Cash-flow projections, forecast vs. actuals, and runway analysis will appear here. Coming soon.
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
