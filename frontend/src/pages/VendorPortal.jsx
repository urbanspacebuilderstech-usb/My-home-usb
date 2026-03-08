import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Package, Truck, CheckCircle, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function VendorPortal() {
  const [user, setUser] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [vehicleNumber, setVehicleNumber] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, dashRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/vendor-portal/dashboard`)
      ]);
      setUser(userRes.data);
      setDashboardData(dashRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const openDispatchDialog = (po) => {
    setSelectedPO(po);
    setVehicleNumber('');
    setDispatchDialogOpen(true);
  };

  const handleDispatch = async () => {
    if (!vehicleNumber.trim()) {
      toast.error('Please enter vehicle number');
      return;
    }

    try {
      await axios.patch(`${API}/vendor-portal/purchase-orders/${selectedPO.po_id}/dispatch?vehicle_number=${encodeURIComponent(vehicleNumber)}`);
      toast.success('Order dispatched successfully');
      setDispatchDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to dispatch order');
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const stats = dashboardData?.stats || { total_orders: 0, pending: 0, dispatched: 0, completed: 0 };
  const purchaseOrders = dashboardData?.purchase_orders || [];
  const vendor = dashboardData?.vendor;

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'dispatched': return 'bg-amber-50 text-amber-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-lg">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Home USB</h1>
              <p className="text-xs text-gray-500">Vendor Portal</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 pl-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">Vendor</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!vendor ? (
          <Card className="p-8">
            <div className="text-center">
              <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Vendor Account Not Linked</h2>
              <p className="text-gray-600">
                Your account is not linked to a vendor profile. Please contact the procurement team to link your account.
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Vendor Info */}
            <div className="mb-8">
              <h2 data-testid="vendor-portal-title" className="text-3xl font-bold text-gray-900">
                Welcome, {vendor.name}
              </h2>
              <p className="text-gray-600 mt-1">
                Contact: {vendor.contact_person} • {vendor.phone}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Package className="h-6 w-6 text-amber-600" />
                    <span className="text-2xl font-bold text-amber-700">{stats.total_orders}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="h-6 w-6 text-yellow-600" />
                    <span className="text-2xl font-bold text-yellow-700">{stats.pending}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Dispatched</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Truck className="h-6 w-6 text-purple-600" />
                    <span className="text-2xl font-bold text-purple-700">{stats.dispatched}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <span className="text-2xl font-bold text-green-700">{stats.completed}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Purchase Orders Table */}
            <Card>
              <CardHeader>
                <CardTitle>My Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PO ID</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Expected Delivery</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vehicle</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {purchaseOrders.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                            No purchase orders assigned to you yet
                          </td>
                        </tr>
                      ) : (
                        purchaseOrders.map((po) => (
                          <tr key={po.po_id} data-testid={`vendor-po-${po.po_id}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-semibold text-purple-600">{po.po_id}</td>
                            <td className="px-6 py-4">{po.item_name}</td>
                            <td className="px-6 py-4">{po.quantity}</td>
                            <td className="px-6 py-4">{new Date(po.expected_delivery).toLocaleDateString()}</td>
                            <td className="px-6 py-4">{po.vehicle_number || '-'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(po.status)}`}>
                                {po.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {po.status === 'pending' && (
                                <Button
                                  data-testid={`dispatch-btn-${po.po_id}`}
                                  size="sm"
                                  className="gap-1 bg-purple-600 hover:bg-purple-700"
                                  onClick={() => openDispatchDialog(po)}
                                >
                                  <Send className="h-4 w-4" />
                                  Dispatch
                                </Button>
                              )}
                              {po.status === 'dispatched' && (
                                <span className="text-sm text-amber-600">In Transit</span>
                              )}
                              {po.status === 'completed' && (
                                <span className="text-sm text-green-600">Delivered</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Dispatch Dialog */}
            <Dialog open={dispatchDialogOpen} onOpenChange={setDispatchDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dispatch Order</DialogTitle>
                  <DialogDescription>
                    Enter the vehicle details for PO: {selectedPO?.po_id}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Item: <span className="font-medium">{selectedPO?.item_name}</span></p>
                    <p className="text-sm text-gray-600">Quantity: <span className="font-medium">{selectedPO?.quantity}</span></p>
                  </div>
                  <div>
                    <Label>Vehicle Number</Label>
                    <Input
                      data-testid="vehicle-number-input"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      placeholder="e.g., TN 01 AB 1234"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      data-testid="confirm-dispatch-btn"
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      onClick={handleDispatch}
                    >
                      Confirm Dispatch
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setDispatchDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
