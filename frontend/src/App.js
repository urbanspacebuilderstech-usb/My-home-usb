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
import Notifications from '@/pages/Notifications';
import UserManagement from '@/pages/UserManagement';
import VendorPortal from '@/pages/VendorPortal';
import FinancialOverview from '@/pages/FinancialOverview';
import ComprehensiveProjectView from '@/pages/ComprehensiveProjectView';
import Income from '@/pages/Income';
import ExpenseManagement from '@/pages/ExpenseManagement';
import Settings from '@/pages/Settings';
import StageManagement from '@/pages/StageManagement';
import MaterialManagement from '@/pages/MaterialManagement';
import VendorMasterManagement from '@/pages/VendorMasterManagement';
import SiteEngineerDashboard from '@/pages/SiteEngineerDashboard';
import SiteEngineerProject from '@/pages/SiteEngineerProject';
import MaterialReceipt from '@/pages/MaterialReceipt';
import ProcurementDashboard from '@/pages/ProcurementDashboard';
import ProcurementBoardV2 from '@/pages/ProcurementBoardV2';
import PackageManagement from '@/pages/PackageManagement';
import CREBoard from '@/pages/CREBoard';
import PlanningBoard from '@/pages/PlanningBoard';
import AccountsBoard from '@/pages/AccountsBoard';
import ProjectFinance from '@/pages/ProjectFinance';
import Cashbook from '@/pages/Cashbook';
import HRPortal from '@/pages/HRPortal';
import ChequeManagement from '@/pages/ChequeManagement';
import PaymentProcessing from '@/pages/PaymentProcessing';
import WorkOrderManagement from '@/pages/WorkOrderManagement';
import LabourContractorManagement from '@/pages/LabourContractorManagement';
import ProjectMaterials from '@/pages/ProjectMaterials';
import IndirectCostManagement from '@/pages/IndirectCostManagement';
import SuspenseAccount from '@/pages/SuspenseAccount';
import CRMPreSales from '@/pages/CRMPreSales';
import CRMSales from '@/pages/CRMSales';
import REProjectsPage from '@/pages/REProjectsPage';
import CustomFieldsBuilder from '@/pages/CustomFieldsBuilder';
import CSVImportPage from '@/pages/CSVImportPage';
import GMDashboard from '@/pages/GMDashboard';
import MarketingBoard from '@/pages/MarketingBoard';
import PMDashboard from '@/pages/PMDashboard';
import ArchitectDashboard from '@/pages/ArchitectDashboard';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

// Clear auth cache on logout or auth failure
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup-password" element={<SetupPassword />} />
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
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/settings/stages" element={<ProtectedRoute><StageManagement /></ProtectedRoute>} />
      <Route path="/materials" element={<ProtectedRoute><MaterialManagement /></ProtectedRoute>} />
      <Route path="/vendor-management" element={<ProtectedRoute><VendorMasterManagement /></ProtectedRoute>} />
      <Route path="/vendor-portal" element={<ProtectedRoute><VendorPortal /></ProtectedRoute>} />
      <Route path="/procurement-board" element={<ProtectedRoute><ProcurementDashboard /></ProtectedRoute>} />
      <Route path="/procurement-board-v2" element={<ProtectedRoute><ProcurementBoardV2 /></ProtectedRoute>} />
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
      <Route path="/hr-portal" element={<ProtectedRoute><HRPortal /></ProtectedRoute>} />
      <Route path="/cheque-management" element={<ProtectedRoute><ChequeManagement /></ProtectedRoute>} />
      <Route path="/payment-processing" element={<ProtectedRoute><PaymentProcessing /></ProtectedRoute>} />
      <Route path="/indirect-costs" element={<ProtectedRoute><IndirectCostManagement /></ProtectedRoute>} />
      <Route path="/suspense-account" element={<ProtectedRoute><SuspenseAccount /></ProtectedRoute>} />
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
    super_admin: '/dashboard'
  };
  return roleRoutes[role] || '/dashboard';
}

// Simple auth cache to avoid repeated /auth/me calls
let cachedUser = null;
let authPromise = null;

async function getAuthUser() {
  if (cachedUser) return cachedUser;
  if (authPromise) return authPromise;
  
  authPromise = axios.get(`${API}/auth/me`)
    .then(res => {
      cachedUser = res.data;
      authPromise = null;
      return cachedUser;
    })
    .catch(err => {
      authPromise = null;
      cachedUser = null;
      throw err;
    });
  
  return authPromise;
}

// Call this on logout to clear cache
function clearAuthCache() {
  cachedUser = null;
  authPromise = null;
}

// Expose to other components
window.__clearAuthCache = clearAuthCache;

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(cachedUser ? true : null);
  const [user, setUser] = useState(cachedUser || null);

  useEffect(() => {
    if (cachedUser) {
      setUser(cachedUser);
      setIsAuthenticated(true);
      return;
    }

    getAuthUser()
      .then(userData => {
        setUser(userData);
        setIsAuthenticated(true);
      })
      .catch(() => {
        setIsAuthenticated(false);
        window.location.href = '/login';
      });
  }, []);

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