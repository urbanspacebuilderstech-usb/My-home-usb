import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users, Target, TrendingUp, UserPlus, Settings, RefreshCw,
  Zap, BarChart3, ArrowRight, Phone, Mail, Clock, CheckCircle,
  User, ChevronRight, Filter, Search, Layers
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function MarketingBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'pre_sales', phone: '' });
  const [allLeads, setAllLeads] = useState([]);
  const [leadsFilter, setLeadsFilter] = useState({ stage_type: '', assigned_to: '' });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (parsedUser.role !== 'super_admin') {
        window.location.href = '/';
        return;
      }
      fetchDashboard();
    } else {
      window.location.href = '/login';
    }
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const [dashRes, settingsRes] = await Promise.all([
        axios.get(`${API}/api/marketing/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/api/marketing/distribution-settings`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setDashboard(dashRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      toast.error('Failed to load marketing dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLeads = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (leadsFilter.stage_type) params.append('stage_type', leadsFilter.stage_type);
      if (leadsFilter.assigned_to) params.append('assigned_to', leadsFilter.assigned_to);
      
      const res = await axios.get(`${API}/api/marketing/all-leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllLeads(res.data.leads);
    } catch (error) {
      toast.error('Failed to load leads');
    }
  };

  useEffect(() => {
    if (user) {
      fetchAllLeads();
    }
  }, [user, leadsFilter]);

  const toggleDistribution = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API}/api/marketing/distribution-settings`, 
        { enabled: !settings.enabled },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
      toast.success(`Lead distribution ${settings.enabled ? 'disabled' : 'enabled'}`);
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.email) {
      toast.error('Name and email are required');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/marketing/team-members`, newMember, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Team member added successfully');
      setShowAddMember(false);
      setNewMember({ name: '', email: '', role: 'pre_sales', phone: '' });
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add team member');
    }
  };

  const handleAssignLead = async (leadId, userId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/marketing/assign-lead/${leadId}?assigned_to=${userId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Lead reassigned successfully');
      fetchAllLeads();
      fetchDashboard();
    } catch (error) {
      toast.error('Failed to assign lead');
    }
  };

  const filteredLeads = allLeads.filter(lead => {
    if (!searchQuery) return true;
    return (
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Marketing Board</h1>
                <p className="text-sm text-gray-500">Lead Distribution Engine</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={fetchDashboard}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </Button>
              <Button onClick={() => setShowAddMember(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Distribution Engine Settings */}
        <Card className="mb-6 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-indigo-600" />
                <div>
                  <CardTitle>Lead Distribution Engine</CardTitle>
                  <CardDescription>Auto-assign leads to team members using round-robin</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="distribution-toggle" className="text-sm font-medium">
                  {settings?.enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="distribution-toggle"
                  checked={settings?.enabled}
                  onCheckedChange={toggleDistribution}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold">Pre-Sales Team</span>
                </div>
                <p className="text-2xl font-bold text-blue-700">{settings?.pre_sales_team?.length || 0} members</p>
                <p className="text-xs text-gray-500 mt-1">Next assignment index: {settings?.pre_sales_current_index || 0}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-5 w-5 text-green-600" />
                  <span className="font-semibold">Sales Team</span>
                </div>
                <p className="text-2xl font-bold text-green-700">{settings?.sales_team?.length || 0} members</p>
                <p className="text-xs text-gray-500 mt-1">Next assignment index: {settings?.sales_current_index || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4">
              <p className="text-blue-100 text-sm">Total Pre-Sales Leads</p>
              <p className="text-3xl font-bold">{dashboard?.total_pre_sales_leads || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <p className="text-green-100 text-sm">Total Sales Appointments</p>
              <p className="text-3xl font-bold">{dashboard?.total_sales_leads || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <p className="text-purple-100 text-sm">Pre-Sales Team</p>
              <p className="text-3xl font-bold">{dashboard?.pre_sales_team?.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <p className="text-orange-100 text-sm">Sales Team</p>
              <p className="text-3xl font-bold">{dashboard?.sales_team?.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="team" className="space-y-4">
          <TabsList className="bg-white border">
            <TabsTrigger value="team" className="data-[state=active]:bg-indigo-100">
              <Users className="h-4 w-4 mr-2" /> Team Performance
            </TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-indigo-100">
              <Layers className="h-4 w-4 mr-2" /> All Leads
            </TabsTrigger>
            <TabsTrigger value="sources" className="data-[state=active]:bg-indigo-100">
              <BarChart3 className="h-4 w-4 mr-2" /> Lead Sources
            </TabsTrigger>
          </TabsList>

          {/* Team Performance Tab */}
          <TabsContent value="team">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Pre-Sales Team */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <Users className="h-5 w-5" /> Pre-Sales Team Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboard?.pre_sales_team?.map((member, idx) => (
                      <div key={member.user_id} className="bg-gray-50 rounded-lg p-4 border hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold">
                              {member.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-semibold">{member.name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <Badge className="bg-blue-100 text-blue-700">{idx + 1}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{member.total_leads}</p>
                            <p className="text-xs text-gray-500">Total Leads</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{member.converted}</p>
                            <p className="text-xs text-gray-500">Converted</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{member.conversion_rate}%</p>
                            <p className="text-xs text-gray-500">Conversion</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!dashboard?.pre_sales_team || dashboard.pre_sales_team.length === 0) && (
                      <p className="text-center text-gray-500 py-8">No Pre-Sales team members yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sales Team */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <Target className="h-5 w-5" /> Sales Team Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboard?.sales_team?.map((member, idx) => (
                      <div key={member.user_id} className="bg-gray-50 rounded-lg p-4 border hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                              {member.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-semibold">{member.name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <Badge className="bg-green-100 text-green-700">{idx + 1}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{member.total_appointments}</p>
                            <p className="text-xs text-gray-500">Appointments</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{member.deals_closed}</p>
                            <p className="text-xs text-gray-500">Deals Closed</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{member.close_rate}%</p>
                            <p className="text-xs text-gray-500">Close Rate</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!dashboard?.sales_team || dashboard.sales_team.length === 0) && (
                      <p className="text-center text-gray-500 py-8">No Sales team members yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* All Leads Tab */}
          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <CardTitle>All Leads</CardTitle>
                  <div className="flex flex-wrap gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search leads..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 w-[200px]"
                      />
                    </div>
                    <Select value={leadsFilter.stage_type} onValueChange={(v) => setLeadsFilter(p => ({ ...p, stage_type: v }))}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="pre_sales">Pre-Sales</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Lead</th>
                        <th className="px-4 py-3 text-left font-semibold">Contact</th>
                        <th className="px-4 py-3 text-left font-semibold">Type</th>
                        <th className="px-4 py-3 text-left font-semibold">Source</th>
                        <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                        <th className="px-4 py-3 text-left font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredLeads.map(lead => (
                        <tr key={lead.lead_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {lead.name?.charAt(0)}
                              </div>
                              <span className="font-medium">{lead.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {lead.phone && <p className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</p>}
                              {lead.email && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={lead.stage_type === 'pre_sales' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                              {lead.stage_type === 'pre_sales' ? 'Pre-Sales' : 'Sales'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{lead.source?.replace('_', ' ')}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Select 
                              value={lead.assigned_to || 'unassigned'} 
                              onValueChange={(v) => v !== 'unassigned' && handleAssignLead(lead.lead_id, v)}
                            >
                              <SelectTrigger className="w-[150px] h-8 text-xs">
                                <SelectValue>
                                  {lead.assigned_to_name || 'Unassigned'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {lead.stage_type === 'pre_sales' ? (
                                  dashboard?.pre_sales_team?.map(m => (
                                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                                  ))
                                ) : (
                                  dashboard?.sales_team?.map(m => (
                                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {filteredLeads.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            No leads found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lead Sources Tab */}
          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle>Lead Sources Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {dashboard?.leads_by_source?.map(source => (
                    <div key={source._id} className="bg-gray-50 rounded-lg p-4 border text-center">
                      <p className="text-3xl font-bold text-indigo-600">{source.count}</p>
                      <p className="text-sm text-gray-600 capitalize">{source._id?.replace('_', ' ') || 'Unknown'}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Recent Leads */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-500" /> Recent Lead Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard?.recent_leads?.slice(0, 10).map(lead => (
                <div key={lead.lead_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${lead.stage_type === 'pre_sales' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                    <span className="font-medium">{lead.name}</span>
                    <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{lead.assigned_to_name || 'Unassigned'}</span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className="text-xs text-gray-400">{new Date(lead.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Add Team Member Dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add a new Pre-Sales or Sales team member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={newMember.name}
                onChange={(e) => setNewMember(p => ({ ...p, name: e.target.value }))}
                placeholder="Enter name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember(p => ({ ...p, email: e.target.value }))}
                placeholder="Enter email"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={newMember.phone}
                onChange={(e) => setNewMember(p => ({ ...p, phone: e.target.value }))}
                placeholder="Enter phone"
              />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={newMember.role} onValueChange={(v) => setNewMember(p => ({ ...p, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_sales">Pre-Sales</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button variant="outline" onClick={() => setShowAddMember(false)}>Cancel</Button>
              <Button onClick={handleAddMember} className="bg-indigo-600 hover:bg-indigo-700">
                <UserPlus className="h-4 w-4 mr-2" /> Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
