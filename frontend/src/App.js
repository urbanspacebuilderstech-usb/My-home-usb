import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import '@/App.css';

import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import SetupPassword from '@/pages/SetupPassword';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import BOQManagement from '@/pages/BOQManagement';
import WorkOrders from '@/pages/WorkOrders';
import ApprovalQueue from '@/pages/ApprovalQueue';
import Procurement from '@/pages/Procurement';
import SiteReceipt from '@/pages/SiteReceipt';
import Expenses from '@/pages/Expenses';
import ClientPortal from '@/pages/ClientPortal';
import ClientPortalV2 from '@/pages/ClientPortalV2';
import Notifications from '@/pages/Notifications';
import UserManagement from '@/pages/UserManagement';
import VendorPortal from '@/pages/VendorPortal';
import FinancialOverview from '@/pages/FinancialOverview';
import ComprehensiveProjectView from '@/pages/ComprehensiveProjectView';
import Income from '@/pages/Income';
import ExpenseManagement from '@/pages/ExpenseManagement';
import Settings from '@/pages/Settings';
import SlotManagement from '@/pages/SlotManagement';
import StageManagement from '@/pages/StageManagement';
import MaterialManagement from '@/pages/MaterialManagement';
import VendorMasterManagement from '@/pages/VendorMasterManagement';
import ContractorManagement from '@/pages/ContractorManagement';
import SiteEngineerDashboard from '@/pages/SiteEngineerDashboard';
import SiteEngineerProject from '@/pages/SiteEngineerProject';
import MaterialReceipt from '@/pages/MaterialReceipt';
import ProcurementDashboard from '@/pages/ProcurementDashboard';
import ProcurementBoardV2 from '@/pages/ProcurementBoardV2';
import ProcurementBoardSimple from '@/pages/ProcurementBoardSimple';
import PackageManagement from '@/pages/PackageManagement';
import CREBoard from '@/pages/CREBoard';
import PlanningBoard from '@/pages/PlanningBoard';
import AccountsBoard from '@/pages/AccountsBoard';
import ProjectFinance from '@/pages/ProjectFinance';
import FinanceBoard from '@/pages/FinanceBoard';
import LabourPaymentsPage from '@/pages/LabourPaymentsPage';
import Cashbook from '@/pages/Cashbook';
import HRPortal from '@/pages/HRPortal';
import ChequeManagement from '@/pages/ChequeManagement';
import PaymentProcessing from '@/pages/PaymentProcessing';
import WorkOrderManagement from '@/pages/WorkOrderManagement';
import LabourContractorManagement from '@/pages/LabourContractorManagement';
import ProjectMaterials from '@/pages/ProjectMaterials';
import IndirectCostManagement from '@/pages/IndirectCostManagement';
import SuspenseAccount from '@/pages/SuspenseAccount';
import OtherAccounts from '@/pages/OtherAccounts';
import DTBoard from '@/pages/DTBoard';
import ProspectApp from '@/pages/ProspectApp';
import PublicQuoteView from '@/pages/PublicQuoteView';
import PublicPackageView from '@/pages/PublicPackageView';
import PublicFinalEstimateView from '@/pages/PublicFinalEstimateView';
import CREFEDetail from '@/pages/CREFEDetail';
import CREPreConstruction from '@/pages/CREPreConstruction';
import UserApp from '@/pages/UserApp';
import CRMPreSales from '@/pages/CRMPreSales';
import CRMSales from '@/pages/CRMSales';
import REProjectsPage from '@/pages/REProjectsPage';
import CustomFieldsBuilder from '@/pages/CustomFieldsBuilder';
import CSVImportPage from '@/pages/CSVImportPage';
import GMDashboard from '@/pages/GMDashboard';
import MarketingBoard from '@/pages/MarketingBoard';
import PMDashboard from '@/pages/PMDashboard';
import ArchitectDashboard from '@/pages/ArchitectDashboard';
import SetupWizard from '@/pages/SetupWizard';
import PaymentSchedulePage from '@/pages/PaymentSchedulePage';
import ProfilePage from '@/pages/ProfilePage';

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
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup-password" element={<SetupPassword />} />
      <Route path="/quote/:token" element={<PublicQuoteView />} />
      <Route path="/package/:token" element={<PublicPackageView />} />
      <Route path="/fe/:token" element={<PublicFinalEstimateView />} />
      <Route path="/cre/final-estimate/:projectId" element={<ProtectedRoute><CREFEDetail /></ProtectedRoute>} />
      <Route path="/cre/pre-construction" element={<ProtectedRoute><CREPreConstruction /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/financial-overview" element={<ProtectedRoute><FinancialOverview /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
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
      <Route path="/accountant-module" element={<ProtectedRoute><Cashbook /></ProtectedRoute>} />
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
      <Route path="/architect-dashboard" element={<ProtectedRoute><ArchitectDashboard /></ProtectedRoute>} />
      <Route path="/marketing-board" element={<ProtectedRoute><MarketingBoard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function getRoleRedirect(role) {
  const roleRoutes = {
    site_engineer: '/site-engineer',
    sr_site_engineer: '/site-engineer',
    pre_sales: '/crm-pre-sales',
    sales: '/crm-sales',
    general_manager: '/gm-dashboard',
    accountant: '/accounts-board',
    planning: '/planning-board',
    procurement: '/procurement-board-v2',
    cre: '/cre-board',
    project_manager: '/pm-dashboard',
    associate_pm: '/pm-dashboard',
    client: '/client-portal',
    vendor: '/vendor-portal',
    marketing_head: '/marketing-board',
    architect: '/architect-dashboard',
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
        accountant: 'Accountant', project_manager: 'Project Manager', planning: 'Planning',
        procurement: 'Procurement', site_engineer: 'Site Engineer', sr_site_engineer: 'Sr. Site Engineer',
        pre_sales: 'Pre Sales', sales: 'Sales', architect: 'Architect',
        marketing_head: 'Marketing Head', client: 'Client', vendor: 'Vendor',
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
