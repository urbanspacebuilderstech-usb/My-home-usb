import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ApprovalQueue() {
  const [user, setUser] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, woRes, projRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/work-orders`),
        axios.get(`${API}/projects`)
      ]);
      setUser(userRes.data);
      // Filter for submitted work orders (pending approval)
      setWorkOrders(woRes.data.filter(wo => wo.status === 'submitted'));
      setProjects(projRes.data);

      // Fetch BOQ for all projects
      const boqPromises = projRes.data.map(p => axios.get(`${API}/boq/${p.project_id}`));
      const boqResponses = await Promise.all(boqPromises);
      setBoqItems(boqResponses.flatMap(r => r.data));
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

  const handleApprove = async (workOrderId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/approve`);
      toast.success('Work order approved');
      fetchData();
    } catch (error) {
      toast.error('Failed to approve work order');
    }
  };

  const handleReject = async () => {
    if (!selectedWO || !rejectReason) return;
    try {
      await axios.patch(`${API}/work-orders/${selectedWO}/reject?reason=${encodeURIComponent(rejectReason)}`);
      toast.success('Work order rejected');
      setRejectDialogOpen(false);
      setSelectedWO(null);
      setRejectReason('');
      fetchData();
    } catch (error) {
      toast.error('Failed to reject work order');
    }
  };

  const openRejectDialog = (workOrderId) => {
    setSelectedWO(workOrderId);
    setRejectDialogOpen(true);
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.project_id === projectId);
    return project?.name || projectId;
  };

  const getBOQItem = (boqId) => {
    return boqItems.find(b => b.boq_id === boqId);
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canApprove = user.role === 'accountant' || user.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 data-testid="approval-queue-title" className="text-3xl font-bold text-gray-900">Approval Queue</h2>
          <p className="text-gray-600 mt-1">Review and approve pending work orders</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-700">{workOrders.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-700">
                ₹{(workOrders.reduce((sum, wo) => sum + (wo.estimated_cost || 0), 0) / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Your Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-700">{user.role.replace('_', ' ').toUpperCase()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Approval Table */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Work Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Order</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Est. Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Purpose</th>
                    {canApprove && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workOrders.length === 0 ? (
                    <tr>
                      <td colSpan={canApprove ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                        No pending approvals
                      </td>
                    </tr>
                  ) : (
                    workOrders.map((wo) => {
                      const boqItem = getBOQItem(wo.boq_id);
                      return (
                        <tr key={wo.work_order_id} data-testid={`approval-row-${wo.work_order_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-amber-600">{wo.work_order_id}</span>
                          </td>
                          <td className="px-6 py-4">{getProjectName(wo.project_id)}</td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium">{boqItem?.item_name || 'N/A'}</div>
                              <div className="text-sm text-gray-500">{boqItem?.category}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-medium">{wo.requested_quantity} {boqItem?.unit}</td>
                          <td className="px-6 py-4 font-semibold text-amber-600">₹{wo.estimated_cost?.toLocaleString() || 0}</td>
                          <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{wo.purpose}</td>
                          {canApprove && (
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <Button
                                  data-testid={`approve-btn-${wo.work_order_id}`}
                                  size="sm"
                                  className="gap-1 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleApprove(wo.work_order_id)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  data-testid={`reject-btn-${wo.work_order_id}`}
                                  size="sm"
                                  variant="destructive"
                                  className="gap-1"
                                  onClick={() => openRejectDialog(wo.work_order_id)}
                                >
                                  <XCircle className="h-4 w-4" />
                                  Reject
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Work Order</DialogTitle>
              <DialogDescription>Please provide a reason for rejection</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rejection Reason</Label>
                <Input
                  data-testid="reject-reason-input"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button
                  data-testid="confirm-reject-btn"
                  variant="destructive"
                  className="flex-1"
                  onClick={handleReject}
                  disabled={!rejectReason}
                >
                  Confirm Rejection
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRejectDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
