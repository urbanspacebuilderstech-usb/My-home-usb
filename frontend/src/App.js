import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef, lazy, Suspense, Component } from 'react';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import '@/App.css';
// DayPicker base styles. Several date filters (Cashbook, PM, Sr SE, DLR)
// render <DayPicker> and rely on these rules being global. Keep this import
// here rather than in one component, or it only loads with that page's chunk.
import 'react-day-picker/dist/style.css';
// Side-effect import: applies the persisted theme to <html> before React paints.
import '@/hooks/useTheme';

import Login from '@/pages/Login';

// Sep 29 2026 — Every page used to be a static import, so all 80 pages
// (plus jspdf, leaflet, dnd-kit…) shipped in one 5 MB main.js that had to
// download and parse before even the login screen appeared. Pages are now
// loaded on demand, one chunk per route. Login stays static because it is
// the first screen for most visits.
//
// Chunk loads can fail in two ways a static bundle never did:
//   * a network blip on site — retry once after a short pause;
//   * a deploy replaced the build (the old hashed chunks are deleted) while
//     this tab was open — reload once so the no-store index.html pulls the
//     new chunk names. The timestamp guard stops a reload loop if the chunk
//     is genuinely unreachable; the error then reaches PageLoadBoundary.
const CHUNK_RELOAD_KEY = 'mhu_chunk_reload_at';

function lazyPage(factory) {
  return lazy(() =>
    factory()
      .catch(() => new Promise(resolve => setTimeout(resolve, 1000)).then(factory))
      .catch(err => {
        let last = 0;
        try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0; } catch {}
        if (Date.now() - last > 10000) {
          try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())); } catch {}
          window.location.reload();
          return new Promise(() => {}); // stay suspended until the reload lands
        }
        throw err;
      })
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50" data-testid="page-loading">
      <div className="h-8 w-8 border-3 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

class PageLoadBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    // Navigating elsewhere (sidebar, back button) gets a fresh attempt.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-3">This page couldn't load. Check your connection and reload.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
const ForgotPassword = lazyPage(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazyPage(() => import('@/pages/ResetPassword'));
const SetupPassword = lazyPage(() => import('@/pages/SetupPassword'));
const Dashboard = lazyPage(() => import('@/pages/Dashboard'));
const Projects = lazyPage(() => import('@/pages/Projects'));
const ProjectDetail = lazyPage(() => import('@/pages/ProjectDetail'));
const BOQManagement = lazyPage(() => import('@/pages/BOQManagement'));
const WorkOrders = lazyPage(() => import('@/pages/WorkOrders'));
const ApprovalQueue = lazyPage(() => import('@/pages/ApprovalQueue'));
const Procurement = lazyPage(() => import('@/pages/Procurement'));
const SiteReceipt = lazyPage(() => import('@/pages/SiteReceipt'));
const Expenses = lazyPage(() => import('@/pages/Expenses'));
const ClientPortal = lazyPage(() => import('@/pages/ClientPortal'));
const ClientPortalV2 = lazyPage(() => import('@/pages/ClientPortalV2'));
const Notifications = lazyPage(() => import('@/pages/Notifications'));
const UserManagement = lazyPage(() => import('@/pages/UserManagement'));
const VendorPortal = lazyPage(() => import('@/pages/VendorPortal'));
const FinancialOverview = lazyPage(() => import('@/pages/FinancialOverview'));
const ComprehensiveProjectView = lazyPage(() => import('@/pages/ComprehensiveProjectView'));
const Income = lazyPage(() => import('@/pages/Income'));
const ExpenseManagement = lazyPage(() => import('@/pages/ExpenseManagement'));
const Settings = lazyPage(() => import('@/pages/Settings'));
const SlotManagement = lazyPage(() => import('@/pages/SlotManagement'));
const StageManagement = lazyPage(() => import('@/pages/StageManagement'));
const AdminAddProject = lazyPage(() => import('@/pages/AdminAddProject'));
const PaymentScheduleTemplates = lazyPage(() => import('@/pages/PaymentScheduleTemplates'));
const MaterialManagement = lazyPage(() => import('@/pages/MaterialManagement'));
const VendorMasterManagement = lazyPage(() => import('@/pages/VendorMasterManagement'));
const ContractorManagement = lazyPage(() => import('@/pages/ContractorManagement'));
const SiteEngineerDashboard = lazyPage(() => import('@/pages/SiteEngineerDashboard'));
const SiteEngineerProject = lazyPage(() => import('@/pages/SiteEngineerProject'));
const MaterialReceipt = lazyPage(() => import('@/pages/MaterialReceipt'));
const ProcurementDashboard = lazyPage(() => import('@/pages/ProcurementDashboard'));
const ProcurementBoardV2 = lazyPage(() => import('@/pages/ProcurementBoardV2'));
const ProcurementBoardSimple = lazyPage(() => import('@/pages/ProcurementBoardSimple'));
const PackageManagement = lazyPage(() => import('@/pages/PackageManagement'));
const CREBoard = lazyPage(() => import('@/pages/CREBoard'));
const PlanningBoard = lazyPage(() => import('@/pages/PlanningBoard'));
const AccountsBoard = lazyPage(() => import('@/pages/AccountsBoard'));
const CloseBooksHistoryPage = lazyPage(() => import('@/pages/CloseBooksHistoryPage'));
const ProjectFinance = lazyPage(() => import('@/pages/ProjectFinance'));
const FinanceBoard = lazyPage(() => import('@/pages/FinanceBoard'));
const LabourPaymentsPage = lazyPage(() => import('@/pages/LabourPaymentsPage'));
const Cashbook = lazyPage(() => import('@/pages/Cashbook'));
const CashflowEngine = lazyPage(() => import('@/pages/CashflowEngine'));
const HRPortal = lazyPage(() => import('@/pages/HRPortal'));
const ChequeManagement = lazyPage(() => import('@/pages/ChequeManagement'));
const PaymentProcessing = lazyPage(() => import('@/pages/PaymentProcessing'));
const WorkOrderManagement = lazyPage(() => import('@/pages/WorkOrderManagement'));
const LabourContractorManagement = lazyPage(() => import('@/pages/LabourContractorManagement'));
const ProjectMaterials = lazyPage(() => import('@/pages/ProjectMaterials'));
const IndirectCostManagement = lazyPage(() => import('@/pages/IndirectCostManagement'));
const SuspenseAccount = lazyPage(() => import('@/pages/SuspenseAccount'));
const OtherAccounts = lazyPage(() => import('@/pages/OtherAccounts'));
const DTBoard = lazyPage(() => import('@/pages/DTBoard'));
const ProspectApp = lazyPage(() => import('@/pages/ProspectApp'));
const PublicQuoteView = lazyPage(() => import('@/pages/PublicQuoteView'));
const PublicPackageView = lazyPage(() => import('@/pages/PublicPackageView'));
const CREFEDetail = lazyPage(() => import('@/pages/CREFEDetail'));
const CREPreConstruction = lazyPage(() => import('@/pages/CREPreConstruction'));
const UserApp = lazyPage(() => import('@/pages/UserApp'));
const CRMPreSales = lazyPage(() => import('@/pages/CRMPreSales'));
const CRMSales = lazyPage(() => import('@/pages/CRMSales'));
const SalesBoard = lazyPage(() => import('@/pages/SalesBoard'));
const PriorityBoard = lazyPage(() => import('@/pages/PriorityBoard'));
const SuperAdminDashboard = lazyPage(() => import('@/pages/SuperAdminDashboard'));
const REProjectsPage = lazyPage(() => import('@/pages/REProjectsPage'));
const CustomFieldsBuilder = lazyPage(() => import('@/pages/CustomFieldsBuilder'));
const CSVImportPage = lazyPage(() => import('@/pages/CSVImportPage'));
const GMDashboard = lazyPage(() => import('@/pages/GMDashboard'));
const MarketingBoard = lazyPage(() => import('@/pages/MarketingBoard'));
const MarketingProjectsBoard = lazyPage(() => import('@/pages/MarketingProjectsBoard'));
const PMDashboard = lazyPage(() => import('@/pages/PMDashboard'));
const QCDashboard = lazyPage(() => import('@/pages/QCDashboard'));
const ArchitectDashboard = lazyPage(() => import('@/pages/ArchitectDashboard'));
const WorkflowMasterPage = lazyPage(() => import('@/pages/WorkflowMasterPage'));
const SetupWizard = lazyPage(() => import('@/pages/SetupWizard'));
const PaymentSchedulePage = lazyPage(() => import('@/pages/PaymentSchedulePage'));
const ProfilePage = lazyPage(() => import('@/pages/ProfilePage'));

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

// Auth interceptor: only invalidate cache on real 401s (auth failure).
// 429 (rate-limit) and 5xx are transient — never log the user out for those.
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    if (status === 401) {
      cachedUser = null;
      authPromise = null;
    }
    return Promise.reject(error);
  }
);
axios.interceptors.request.use(config => {
  if (config.url?.includes('/auth/logout')) {
    cachedUser = null;
    authPromise = null;
  }
  return config;
});

function AppRouter() {
  const location = useLocation();

  // Feb 26 2026 — Sync the browser tab title and favicon with the
  // app-name / favicon configured in Super Admin → Settings → Branding.
  // One fetch per mount, kept lightweight (public endpoint, no auth).
  useEffect(() => {
    axios.get(`${API}/branding`).then(r => {
      const b = r.data || {};
      if (b.app_name) {
        try { document.title = b.app_name; } catch (e) { /* ignore */ }
      }
      if (b.favicon_url) {
        try {
          const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
          link.rel = 'icon';
          link.href = b.favicon_url;
          document.head.appendChild(link);
        } catch (e) { /* ignore */ }
      }
    }).catch(() => {});
  }, []);
  
  return (
    <PageLoadBoundary resetKey={location.pathname}>
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup-password" element={<SetupPassword />} />
      <Route path="/quote/:token" element={<PublicQuoteView />} />
      <Route path="/package/:token" element={<PublicPackageView />} />
      <Route path="/fe/:token" element={<Navigate to="/login" replace />} />
      <Route path="/cre/final-estimate/:projectId" element={<ProtectedRoute><CREFEDetail /></ProtectedRoute>} />
      <Route path="/cre/pre-construction" element={<ProtectedRoute><CREPreConstruction /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/financial-overview" element={<ProtectedRoute><FinancialOverview /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/admin/add-project" element={<ProtectedRoute><AdminAddProject /></ProtectedRoute>} />
      <Route path="/payment-schedule-templates" element={<ProtectedRoute><PaymentScheduleTemplates /></ProtectedRoute>} />
      <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/projects/:projectId/materials" element={<ProtectedRoute><ProjectMaterials /></ProtectedRoute>} />
      <Route path="/projects/:projectId/comprehensive" element={<ProtectedRoute><ComprehensiveProjectView /></ProtectedRoute>} />
      <Route path="/boq/:projectId" element={<ProtectedRoute><BOQManagement /></ProtectedRoute>} />
      <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><Procurement /></ProtectedRoute>} />
      <Route path="/site-receipt" element={<ProtectedRoute><SiteReceipt /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/expense-management" element={<ProtectedRoute><ExpenseManagement /></ProtectedRoute>} />
      <Route path="/income" element={<ProtectedRoute><Income /></ProtectedRoute>} />
      <Route path="/client-portal" element={<ProtectedRoute><ClientPortal /></ProtectedRoute>} />
      <Route path="/client-portal/:projectId" element={<ProtectedRoute><ClientPortal /></ProtectedRoute>} />
      <Route path="/client" element={<ClientPortalV2 />} />
      <Route path="/client/:projectId" element={<ClientPortalV2 />} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/settings/slots" element={<ProtectedRoute><SlotManagement /></ProtectedRoute>} />
      <Route path="/settings/stages" element={<ProtectedRoute><StageManagement /></ProtectedRoute>} />
      <Route path="/materials" element={<ProtectedRoute><MaterialManagement /></ProtectedRoute>} />
      <Route path="/vendor-management" element={<ProtectedRoute><VendorMasterManagement /></ProtectedRoute>} />
      <Route path="/contractor-management" element={<ProtectedRoute><ContractorManagement /></ProtectedRoute>} />
      <Route path="/vendor-portal" element={<ProtectedRoute><VendorPortal /></ProtectedRoute>} />
      <Route path="/procurement-board" element={<ProtectedRoute><ProcurementBoardSimple /></ProtectedRoute>} />
      <Route path="/procurement-board-v2" element={<ProtectedRoute><ProcurementBoardSimple /></ProtectedRoute>} />
      <Route path="/procurement-board-legacy" element={<ProtectedRoute><ProcurementBoardV2 /></ProtectedRoute>} />
      <Route path="/procurement-board-legacy-v1" element={<ProtectedRoute><ProcurementDashboard /></ProtectedRoute>} />
      <Route path="/site-engineer" element={<ProtectedRoute><SiteEngineerDashboard /></ProtectedRoute>} />
      <Route path="/site-engineer/project/:projectId" element={<ProtectedRoute><SiteEngineerProject /></ProtectedRoute>} />
      <Route path="/site-engineer/material-receipt" element={<ProtectedRoute><MaterialReceipt /></ProtectedRoute>} />
      <Route path="/packages" element={<ProtectedRoute><PackageManagement /></ProtectedRoute>} />
      <Route path="/cre-board" element={<ProtectedRoute><CREBoard /></ProtectedRoute>} />
      <Route path="/cro-board" element={<ProtectedRoute><CREBoard /></ProtectedRoute>} />
      <Route path="/planning-board" element={<ProtectedRoute><PlanningBoard /></ProtectedRoute>} />
      <Route path="/accounts-board" element={<ProtectedRoute><AccountsBoard /></ProtectedRoute>} />
      <Route path="/close-books-history" element={<ProtectedRoute><CloseBooksHistoryPage /></ProtectedRoute>} />
      <Route path="/accountant-module" element={<ProtectedRoute><Cashbook /></ProtectedRoute>} />
      <Route path="/cashflow-engine" element={<ProtectedRoute><CashflowEngine /></ProtectedRoute>} />
      <Route path="/accountant-dashboard" element={<ProtectedRoute><ProjectFinance /></ProtectedRoute>} />
      <Route path="/finance-board" element={<ProtectedRoute><FinanceBoard /></ProtectedRoute>} />
      <Route path="/labour-payments" element={<ProtectedRoute><LabourPaymentsPage /></ProtectedRoute>} />
      <Route path="/hr-portal" element={<ProtectedRoute><HRPortal /></ProtectedRoute>} />
      <Route path="/payment-schedule" element={<ProtectedRoute><PaymentSchedulePage /></ProtectedRoute>} />
      <Route path="/cheque-management" element={<ProtectedRoute><ChequeManagement /></ProtectedRoute>} />
      <Route path="/payment-processing" element={<ProtectedRoute><PaymentProcessing /></ProtectedRoute>} />
      <Route path="/indirect-costs" element={<ProtectedRoute><IndirectCostManagement /></ProtectedRoute>} />
      <Route path="/suspense-account" element={<ProtectedRoute><SuspenseAccount /></ProtectedRoute>} />
      <Route path="/other-accounts" element={<ProtectedRoute><OtherAccounts /></ProtectedRoute>} />
      <Route path="/dt-board" element={<ProtectedRoute><DTBoard /></ProtectedRoute>} />
      <Route path="/prospect-app" element={<ProtectedRoute><ProspectApp /></ProtectedRoute>} />
      <Route path="/user-app" element={<ProtectedRoute><UserApp /></ProtectedRoute>} />
      <Route path="/work-order-management" element={<ProtectedRoute><WorkOrderManagement /></ProtectedRoute>} />
      <Route path="/labour-contractors" element={<ProtectedRoute><LabourContractorManagement /></ProtectedRoute>} />
      <Route path="/crm-pre-sales" element={<ProtectedRoute><CRMPreSales /></ProtectedRoute>} />
      <Route path="/crm-sales" element={<ProtectedRoute><CRMSales /></ProtectedRoute>} />
      <Route path="/crm/re-projects" element={<ProtectedRoute><REProjectsPage /></ProtectedRoute>} />
      <Route path="/crm/custom-fields" element={<ProtectedRoute><CustomFieldsBuilder /></ProtectedRoute>} />
      <Route path="/crm/import-csv" element={<ProtectedRoute><CSVImportPage /></ProtectedRoute>} />
      <Route path="/gm-dashboard" element={<ProtectedRoute><GMDashboard /></ProtectedRoute>} />
      <Route path="/pm-dashboard" element={<ProtectedRoute><PMDashboard /></ProtectedRoute>} />
      <Route path="/qc-dashboard" element={<ProtectedRoute><QCDashboard /></ProtectedRoute>} />
      <Route path="/architect-dashboard" element={<ProtectedRoute><ArchitectDashboard /></ProtectedRoute>} />
      <Route path="/workflow-master" element={<ProtectedRoute><WorkflowMasterPage /></ProtectedRoute>} />
      <Route path="/sales-board" element={<ProtectedRoute><SalesBoard /></ProtectedRoute>} />
      <Route path="/priority-board" element={<ProtectedRoute><PriorityBoard /></ProtectedRoute>} />
      <Route path="/super-admin-dashboard" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
      <Route path="/marketing-board" element={<ProtectedRoute><MarketingBoard /></ProtectedRoute>} />
      <Route path="/marketing-projects" element={<ProtectedRoute><MarketingProjectsBoard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
    </PageLoadBoundary>
  );
}

function getRoleRedirect(role) {
  const roleRoutes = {
    site_engineer: '/site-engineer',
    sr_site_engineer: '/site-engineer',
    pre_sales: '/crm-pre-sales',
    sales: '/crm-sales',
    sales_head: '/priority-board',
    general_manager: '/gm-dashboard',
    accountant: '/accounts-board',
    planning: '/planning-board',
    planning_person: '/planning-board',
    procurement: '/procurement-board-v2',
    cre: '/cre-board',
    project_manager: '/pm-dashboard',
    associate_pm: '/pm-dashboard',
    quality_check: '/qc-dashboard',
    client: '/client-portal',
    vendor: '/vendor-portal',
    marketing_head: '/marketing-board',
    drawlead_marketing: '/marketing-projects',
    architect: '/architect-dashboard',
    super_architect: '/workflow-master',
    hr: '/hr-portal',
    prospect: '/prospect-app',
    super_admin: '/finance-board'
  };
  return roleRoutes[role] || '/dashboard';
}

// Simple auth cache to avoid repeated /auth/me calls.
// Also persisted in sessionStorage so a force-refresh hydrates instantly
// (no "Authenticating…" flash), while `/auth/me` re-validates in background.
const AUTH_CACHE_KEY = 'mhu_user_cache';
let cachedUser = (() => {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
})();
let authPromise = null;

async function getAuthUser(forceRefresh = false) {
  if (!forceRefresh && cachedUser) return cachedUser;
  if (authPromise) return authPromise;

  authPromise = axios.get(`${API}/auth/me`)
    .then(res => {
      cachedUser = res.data;
      try { sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cachedUser)); } catch {}
      authPromise = null;
      return cachedUser;
    })
    .catch(err => {
      authPromise = null;
      // Only wipe cache on hard auth failure
      const s = err?.response?.status;
      if (s === 401 || s === 403) {
        cachedUser = null;
        try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch {}
      }
      throw err;
    });

  return authPromise;
}

// Call this on logout to clear cache
function clearAuthCache() {
  cachedUser = null;
  authPromise = null;
  try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch {}
}

// Expose to other components
window.__clearAuthCache = clearAuthCache;

function ProtectedRoute({ children }) {
  // Hydrate instantly from sessionStorage. If we already have a user we
  // skip the blocking "Authenticating…" screen and revalidate silently.
  const [isAuthenticated, setIsAuthenticated] = useState(cachedUser ? true : null);
  const [user, setUser] = useState(cachedUser || null);

  useEffect(() => {
    const hasCache = !!cachedUser;
    // If we have a cached user, re-validate silently in the background.
    // If we don't, block on /auth/me and show the spinner.
    getAuthUser()
      .then(userData => {
        setUser(userData);
        setIsAuthenticated(true);
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setIsAuthenticated(false);
          window.location.href = '/login';
          return;
        }
        // Network/rate-limit/5xx blip. If we already had a cached user,
        // trust it and keep the UI interactive — do NOT flash the spinner.
        if (hasCache) return;

        const wait = status === 429 ? 2000 : 1500;
        setTimeout(() => {
          getAuthUser()
            .then(u => { setUser(u); setIsAuthenticated(true); })
            .catch((e2) => {
              const s2 = e2?.response?.status;
              if (s2 === 401 || s2 === 403) {
                setIsAuthenticated(false);
                window.location.href = '/login';
              } else {
                setIsAuthenticated(true);
              }
            });
        }, wait);
      });
  }, []);

  useEffect(() => {
    if (user?.role) {
      const roleLabels = {
        super_admin: 'Super Admin', general_manager: 'General Manager', cre: 'CRE',
        accountant: 'Accountant', project_manager: 'Project Manager', planning: 'Planning Head',
        planning_person: 'Planning Person',
        procurement: 'Procurement', site_engineer: 'Site Engineer', sr_site_engineer: 'Sr. Site Engineer',
        pre_sales: 'Pre Sales', sales: 'Sales', architect: 'Architect',
        marketing_head: 'Marketing Head', sales_head: 'Sales Head', drawlead_marketing: 'Drawlead Marketing', client: 'Client', vendor: 'Vendor',
      };
      document.title = `${roleLabels[user.role] || user.role} | My Home USB`;
    }
  }, [user]);

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" data-testid="auth-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-center" closeButton richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
