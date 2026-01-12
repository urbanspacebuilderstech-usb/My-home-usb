import { useState, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle, XCircle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ApprovalQueue() {
  const [user, setUser] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedWO, setSelectedWO] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, woRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/work-orders`)
      ]);
      setUser(userRes.data);
      setWorkOrders(woRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleApprove = async (workOrderId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/approve`);
      toast.success('Work order approved');
      fetchData();
    } catch (error) {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async () => {
    try {
      await axios.patch(`${API}/work-orders/${selectedWO}/reject?reason=${encodeURIComponent(rejectReason)}`);
      toast.success('Work order rejected');
      setRejectDialog(false);
      setRejectReason('');
      fetchData();
    } catch (error) {
      toast.error('Failed to reject');
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <h1 data-testid="approvals-title" className="text-3xl font-bold mb-8">Approval Queue</h1>

        <div className="space-y-4">
          {workOrders.filter(wo => wo.status === 'submitted').length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No pending approvals</Card>
          ) : (
            workOrders.filter(wo => wo.status === 'submitted').map((wo) => (
              <Card key={wo.work_order_id} data-testid={`approval-${wo.work_order_id}`} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">WO-{wo.work_order_id}</h3>
                    <p className="text-muted-foreground">Project: {wo.project_id}</p>
                    <p className="text-sm mt-2">{wo.purpose}</p>
                    <p className="text-sm font-semibold mt-2">Quantity: {wo.requested_quantity} | Estimated: ₹{wo.estimated_cost.toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      data-testid={`approve-btn-${wo.work_order_id}`}
                      onClick={() => handleApprove(wo.work_order_id)}
                      className="gap-2"
                    >
                      <CheckCircle className="h-4 w-4" />Approve
                    </Button>
                    <Button
                      data-testid={`reject-btn-${wo.work_order_id}`}
                      variant="destructive"
                      onClick={() => { setSelectedWO(wo.work_order_id); setRejectDialog(true); }}
                      className="gap-2"
                    >
                      <XCircle className="h-4 w-4" />Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject Work Order</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rejection Reason</Label>
                <Textarea
                  data-testid="reject-reason-input"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide reason for rejection"
                  required
                />
              </div>
              <Button data-testid="confirm-reject-btn" onClick={handleReject} variant="destructive">Confirm Rejection</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}