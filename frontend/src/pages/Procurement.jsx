import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Plus, Package, Truck, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Procurement() {
  const [user, setUser] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('vendors');
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [poDialogOpen, setPODialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedVendorForLink, setSelectedVendorForLink] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  const [vendorFormData, setVendorFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: ''
  });

  const [poFormData, setPOFormData] = useState({
    work_order_id: '',
    vendor_id: '',
    item_name: '',
    quantity: '',
    expected_delivery: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, vendorsRes, posRes, woRes, usersRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/vendors`),
        axios.get(`${API}/purchase-orders`),
        axios.get(`${API}/work-orders`),
        axios.get(`${API}/users`).catch(() => ({ data: [] }))
      ]);
      setUser(userRes.data);
      setVendors(vendorsRes.data);
      setPurchaseOrders(posRes.data);
      setWorkOrders(woRes.data.filter(wo => wo.status === 'approved'));
      setUsers(usersRes.data || []);
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

  const resetVendorForm = () => {
    setVendorFormData({ name: '', contact_person: '', phone: '', email: '', address: '' });
    setEditingVendor(null);
  };

  const openEditVendor = (vendor) => {
    setEditingVendor(vendor);
    setVendorFormData({
      name: vendor.name,
      contact_person: vendor.contact_person,
      phone: vendor.phone,
      email: vendor.email || '',
      address: vendor.address || ''
    });
    setVendorDialogOpen(true);
  };

  const handleAddOrUpdateVendor = async (e) => {
    e.preventDefault();
    try {
      if (editingVendor) {
        await axios.patch(`${API}/vendors/${editingVendor.vendor_id}`, vendorFormData);
        toast.success('Vendor updated successfully');
      } else {
        await axios.post(`${API}/vendors`, vendorFormData);
        toast.success('Vendor added successfully');
      }
      setVendorDialogOpen(false);
      resetVendorForm();
      fetchData();
    } catch (error) {
      toast.error(editingVendor ? 'Failed to update vendor' : 'Failed to add vendor');
    }
  };

  const handleDeleteVendor = async (vendorId) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;
    try {
      await axios.delete(`${API}/vendors/${vendorId}`);
      toast.success('Vendor deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete vendor');
    }
  };

  const handleCreatePO = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/purchase-orders`, {
        ...poFormData,
        quantity: parseFloat(poFormData.quantity),
        expected_delivery: new Date(poFormData.expected_delivery).toISOString()
      });
      toast.success('Purchase order created');
      setPODialogOpen(false);
      setPOFormData({ work_order_id: '', vendor_id: '', item_name: '', quantity: '', expected_delivery: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to create purchase order');
    }
  };

  const openLinkDialog = (vendor) => {
    setSelectedVendorForLink(vendor);
    setSelectedUserId('');
    setLinkDialogOpen(true);
  };

  const handleLinkVendor = async () => {
    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }
    try {
      await axios.patch(`${API}/vendors/${selectedVendorForLink.vendor_id}/link-user?target_user_id=${selectedUserId}`);
      toast.success('Vendor linked to user successfully');
      setLinkDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to link vendor');
    }
  };

  const getVendorName = (vendorId) => {
    const vendor = vendors.find(v => v.vendor_id === vendorId);
    return vendor?.name || vendorId;
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canManage = user.role === 'procurement' || user.role === 'super_admin';
  const availableUsersForLink = users.filter(u => u.role !== 'vendor' && u.role !== 'super_admin');

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 data-testid="procurement-title" className="text-3xl font-bold text-gray-900">Procurement</h2>
          <p className="text-gray-600 mt-1">Manage vendors and purchase orders</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-700">{vendors.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Purchase Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-700">{purchaseOrders.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending POs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-700">
                {purchaseOrders.filter(po => po.status === 'pending').length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Approved WOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-700">{workOrders.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <TabsList>
                  <TabsTrigger value="vendors">Vendors</TabsTrigger>
                  <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
                </TabsList>
                {canManage && (
                  <div className="flex gap-2">
                    {activeTab === 'vendors' && (
                      <Dialog open={vendorDialogOpen} onOpenChange={(open) => { setVendorDialogOpen(open); if (!open) resetVendorForm(); }}>
                        <DialogTrigger asChild>
                          <Button data-testid="add-vendor-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                            <Plus className="h-4 w-4" />Add Vendor
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
                            <DialogDescription>{editingVendor ? 'Update vendor details' : 'Add a new vendor to the system'}</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleAddOrUpdateVendor} className="space-y-4">
                            <div>
                              <Label>Company Name</Label>
                              <Input
                                data-testid="vendor-name-input"
                                value={vendorFormData.name}
                                onChange={(e) => setVendorFormData({...vendorFormData, name: e.target.value})}
                                required
                              />
                            </div>
                            <div>
                              <Label>Contact Person</Label>
                              <Input
                                data-testid="vendor-contact-input"
                                value={vendorFormData.contact_person}
                                onChange={(e) => setVendorFormData({...vendorFormData, contact_person: e.target.value})}
                                required
                              />
                            </div>
                            <div>
                              <Label>Phone</Label>
                              <Input
                                data-testid="vendor-phone-input"
                                value={vendorFormData.phone}
                                onChange={(e) => setVendorFormData({...vendorFormData, phone: e.target.value})}
                                required
                              />
                            </div>
                            <div>
                              <Label>Email</Label>
                              <Input
                                data-testid="vendor-email-input"
                                type="email"
                                value={vendorFormData.email}
                                onChange={(e) => setVendorFormData({...vendorFormData, email: e.target.value})}
                              />
                            </div>
                            <div>
                              <Label>Address</Label>
                              <Input
                                data-testid="vendor-address-input"
                                value={vendorFormData.address}
                                onChange={(e) => setVendorFormData({...vendorFormData, address: e.target.value})}
                              />
                            </div>
                            <Button data-testid="submit-vendor-btn" type="submit" className="w-full">
                              {editingVendor ? 'Update Vendor' : 'Add Vendor'}
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                    {activeTab === 'purchase-orders' && workOrders.length > 0 && (
                      <Dialog open={poDialogOpen} onOpenChange={setPODialogOpen}>
                        <DialogTrigger asChild>
                          <Button data-testid="create-po-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                            <Plus className="h-4 w-4" />Create PO
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create Purchase Order</DialogTitle>
                            <DialogDescription>Create a PO from an approved work order</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreatePO} className="space-y-4">
                            <div>
                              <Label>Work Order</Label>
                              <Select
                                value={poFormData.work_order_id}
                                onValueChange={(v) => setPOFormData({...poFormData, work_order_id: v})}
                              >
                                <SelectTrigger data-testid="po-wo-select">
                                  <SelectValue placeholder="Select work order" />
                                </SelectTrigger>
                                <SelectContent>
                                  {workOrders.map(wo => (
                                    <SelectItem key={wo.work_order_id} value={wo.work_order_id}>
                                      {wo.work_order_id} - {wo.purpose}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Vendor</Label>
                              <Select
                                value={poFormData.vendor_id}
                                onValueChange={(v) => setPOFormData({...poFormData, vendor_id: v})}
                              >
                                <SelectTrigger data-testid="po-vendor-select">
                                  <SelectValue placeholder="Select vendor" />
                                </SelectTrigger>
                                <SelectContent>
                                  {vendors.map(v => (
                                    <SelectItem key={v.vendor_id} value={v.vendor_id}>
                                      {v.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Item Name</Label>
                              <Input
                                data-testid="po-item-input"
                                value={poFormData.item_name}
                                onChange={(e) => setPOFormData({...poFormData, item_name: e.target.value})}
                                required
                              />
                            </div>
                            <div>
                              <Label>Quantity</Label>
                              <Input
                                data-testid="po-quantity-input"
                                type="number"
                                value={poFormData.quantity}
                                onChange={(e) => setPOFormData({...poFormData, quantity: e.target.value})}
                                required
                              />
                            </div>
                            <div>
                              <Label>Expected Delivery</Label>
                              <Input
                                data-testid="po-delivery-input"
                                type="date"
                                value={poFormData.expected_delivery}
                                onChange={(e) => setPOFormData({...poFormData, expected_delivery: e.target.value})}
                                required
                              />
                            </div>
                            <Button data-testid="submit-po-btn" type="submit" className="w-full">Create Purchase Order</Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>

            <TabsContent value="vendors" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contact Person</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Portal Access</th>
                      {canManage && <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {vendors.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                          No vendors found
                        </td>
                      </tr>
                    ) : (
                      vendors.map((vendor) => (
                        <tr key={vendor.vendor_id} data-testid={`vendor-row-${vendor.vendor_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium">{vendor.name}</td>
                          <td className="px-6 py-4">{vendor.contact_person}</td>
                          <td className="px-6 py-4">{vendor.phone}</td>
                          <td className="px-6 py-4">{vendor.email || '-'}</td>
                          <td className="px-6 py-4">
                            {vendor.user_id ? (
                              <Badge variant="default" className="bg-green-600">Linked</Badge>
                            ) : (
                              <Badge variant="secondary">Not Linked</Badge>
                            )}
                          </td>
                          {canManage && (
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <Button
                                  data-testid={`edit-vendor-${vendor.vendor_id}`}
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditVendor(vendor)}
                                >
                                  <Edit className="h-4 w-4 text-amber-600" />
                                </Button>
                                <Button
                                  data-testid={`delete-vendor-${vendor.vendor_id}`}
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteVendor(vendor.vendor_id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                                {!vendor.user_id && (
                                  <Button
                                    data-testid={`link-vendor-${vendor.vendor_id}`}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openLinkDialog(vendor)}
                                  >
                                    Link User
                                  </Button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="purchase-orders" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PO ID</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Expected Delivery</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vehicle</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseOrders.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                          No purchase orders found
                        </td>
                      </tr>
                    ) : (
                      purchaseOrders.map((po) => (
                        <tr key={po.po_id} data-testid={`po-row-${po.po_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-semibold text-amber-600">{po.po_id}</td>
                          <td className="px-6 py-4">{getVendorName(po.vendor_id)}</td>
                          <td className="px-6 py-4">{po.item_name}</td>
                          <td className="px-6 py-4">{po.quantity}</td>
                          <td className="px-6 py-4">{new Date(po.expected_delivery).toLocaleDateString()}</td>
                          <td className="px-6 py-4">{po.vehicle_number || '-'}</td>
                          <td className="px-6 py-4">
                            <Badge variant={
                              po.status === 'completed' ? 'default' :
                              po.status === 'dispatched' ? 'secondary' :
                              'outline'
                            }>
                              {po.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Link Vendor Dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link Vendor to User Account</DialogTitle>
              <DialogDescription>
                Link {selectedVendorForLink?.name} to a user account for portal access
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger data-testid="link-user-select">
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsersForLink.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  data-testid="confirm-link-btn"
                  className="flex-1 bg-secondary hover:bg-secondary/90"
                  onClick={handleLinkVendor}
                >
                  Link Vendor
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setLinkDialogOpen(false)}
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
