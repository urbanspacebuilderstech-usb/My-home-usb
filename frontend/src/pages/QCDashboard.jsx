import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import RABApprovalQueue from '../components/RABApprovalQueue';
import { ShieldCheck, Banknote } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function QCDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/auth/me`);
        if (!['quality_check', 'super_admin'].includes(res.data.role)) {
          toast.error('Access denied');
          window.location.href = '/dashboard';
          return;
        }
        setUser(res.data);
      } catch (err) {
        if (err.response?.status === 401) window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg border p-8 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="qc-dashboard">
      <AppHeader user={user} />
      <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6">
        <div className="mb-3">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-600" /> Quality Control Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Review and approve labour RAB submissions before forwarding to Planning.</p>
        </div>

        <Tabs defaultValue="labour_rab">
          <TabsList className="bg-white border shadow-sm mb-3">
            <TabsTrigger value="labour_rab" className="text-xs sm:text-sm" data-testid="qc-tab-rab">
              <Banknote className="h-3.5 w-3.5 mr-1.5" /> Labour RAB
            </TabsTrigger>
          </TabsList>

          <TabsContent value="labour_rab">
            <RABApprovalQueue role="quality_check" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
