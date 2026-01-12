import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import '@/App.css';

import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/boq/:projectId" element={<ProtectedRoute><BOQManagement /></ProtectedRoute>} />
      <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
      <Route path="/approvals" element={<ProtectedRoute><ApprovalQueue /></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><Procurement /></ProtectedRoute>} />
      <Route path="/site-receipt" element={<ProtectedRoute><SiteReceipt /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/client-portal/:projectId" element={<ProtectedRoute><ClientPortal /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(location.state?.user ? true : null);
  const [user, setUser] = useState(location.state?.user || null);
  const navigate = (path, options) => {
    window.location.href = path;
  };

  useEffect(() => {
    if (location.state?.user) return;

    const checkAuth = async () => {
      try {
        const response = await axios.get(`${API}/auth/me`);
        setUser(response.data);
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
        navigate('/login');
      }
    };

    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-semibold">Loading...</div>
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
        <Toaster position="top-right" />
      </BrowserRouter>
    </div>
  );
}

export default App;