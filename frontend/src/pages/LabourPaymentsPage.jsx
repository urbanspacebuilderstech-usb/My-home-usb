import { useState, useEffect } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import AccountantLabourPayments from '../components/AccountantLabourPayments';
import LabourContractorPaymentSummary from '../components/LabourContractorPaymentSummary';
import MaterialVendorPaymentSummary from '../components/MaterialVendorPaymentSummary';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LabourPaymentsPage() {
  const [user, setUser] = useState(null);
  const [params] = useSearchParams();
  const embedded = params.get('embedded') === '1';
  const [tab, setTab] = useState(params.get('tab') || 'queue');

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(r => setUser(r.data))
      .catch(() => { window.location.href = '/login'; });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {!embedded && <AppHeader user={user} />}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border w-full sm:w-auto">
            <TabsTrigger value="queue" data-testid="lp-tab-queue" className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 text-xs sm:text-sm">Pending Releases</TabsTrigger>
            <TabsTrigger value="summary" data-testid="lp-tab-summary" className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 text-xs sm:text-sm">Contractor Summary</TabsTrigger>
            <TabsTrigger value="material_vendor" data-testid="lp-tab-material-vendor" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 text-xs sm:text-sm">Material Vendor</TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="mt-3">
            <AccountantLabourPayments />
          </TabsContent>
          <TabsContent value="summary" className="mt-3">
            <LabourContractorPaymentSummary />
          </TabsContent>
          <TabsContent value="material_vendor" className="mt-3">
            <MaterialVendorPaymentSummary />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
