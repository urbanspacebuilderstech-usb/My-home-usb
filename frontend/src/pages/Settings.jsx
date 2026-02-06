import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Settings as SettingsIcon, Users, Package, Truck, Save, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'AED', label: 'UAE Dirham (AED)' }
];

export default function Settings() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  
  const [companySettings, setCompanySettings] = useState({
    company_name: '',
    logo_url: '',
    address: '',
    contact_number: '',
    email: '',
    gst_number: '',
    default_currency: 'INR',
    financial_year_start: 'April'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, settingsRes, summaryRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/settings/company`),
        axios.get(`${API}/settings/summary`)
      ]);
      setUser(userRes.data);
      if (settingsRes.data) {
        setCompanySettings({
          company_name: settingsRes.data.company_name || '',
          logo_url: settingsRes.data.logo_url || '',
          address: settingsRes.data.address || '',
          contact_number: settingsRes.data.contact_number || '',
          email: settingsRes.data.email || '',
          gst_number: settingsRes.data.gst_number || '',
          default_currency: settingsRes.data.default_currency || 'INR',
          financial_year_start: settingsRes.data.financial_year_start || 'April'
        });
      }
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
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

  const handleSaveCompanySettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await axios.post(`${API}/settings/company`, companySettings);
      toast.success('Company settings saved successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-semibold">Loading...</div>
      </div>
    );
  }

  if (user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <SettingsIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">Only Super Admin can access system settings.</p>
            <Button onClick={() => window.location.href = '/dashboard'}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500">System Settings</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/projects'}>
              Projects
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 data-testid="settings-title" className="text-3xl font-bold text-gray-900">System Settings</h2>
            <p className="text-gray-600 mt-1">Manage company profile, materials, and users</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('company')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Company Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Building className="h-6 w-6 text-blue-600" />
                <span className="text-lg font-bold text-blue-700">{summary?.company_name || 'Not Set'}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/materials'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Materials</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-green-600" />
                <span className="text-2xl font-bold text-green-700">{summary?.materials_count || 0}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/vendor-management'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Truck className="h-6 w-6 text-purple-600" />
                <span className="text-2xl font-bold text-purple-700">{summary?.vendors_count || 0}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/users'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-orange-600" />
                <span className="text-2xl font-bold text-orange-700">{summary?.users_count || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="company" className="gap-2">
              <Building className="h-4 w-4" /> Company Profile
            </TabsTrigger>
            <TabsTrigger value="quick-links" className="gap-2">
              <SettingsIcon className="h-4 w-4" /> Quick Links
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>Configure your company information that appears across the system</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveCompanySettings} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name *</Label>
                      <Input
                        id="company_name"
                        data-testid="company-name-input"
                        value={companySettings.company_name}
                        onChange={(e) => setCompanySettings({...companySettings, company_name: e.target.value})}
                        placeholder="Your Company Name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Company Email</Label>
                      <Input
                        id="email"
                        type="email"
                        data-testid="company-email-input"
                        value={companySettings.email}
                        onChange={(e) => setCompanySettings({...companySettings, email: e.target.value})}
                        placeholder="company@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact_number">Contact Number</Label>
                      <Input
                        id="contact_number"
                        data-testid="company-phone-input"
                        value={companySettings.contact_number}
                        onChange={(e) => setCompanySettings({...companySettings, contact_number: e.target.value})}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gst_number">GST Number</Label>
                      <Input
                        id="gst_number"
                        data-testid="company-gst-input"
                        value={companySettings.gst_number}
                        onChange={(e) => setCompanySettings({...companySettings, gst_number: e.target.value})}
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        data-testid="company-address-input"
                        value={companySettings.address}
                        onChange={(e) => setCompanySettings({...companySettings, address: e.target.value})}
                        placeholder="123 Main Street, City, State, PIN"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="default_currency">Default Currency</Label>
                      <Select
                        value={companySettings.default_currency}
                        onValueChange={(v) => setCompanySettings({...companySettings, default_currency: v})}
                      >
                        <SelectTrigger data-testid="company-currency-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="financial_year_start">Financial Year Starts</Label>
                      <Select
                        value={companySettings.financial_year_start}
                        onValueChange={(v) => setCompanySettings({...companySettings, financial_year_start: v})}
                      >
                        <SelectTrigger data-testid="company-fy-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="logo_url">Logo URL</Label>
                      <Input
                        id="logo_url"
                        data-testid="company-logo-input"
                        value={companySettings.logo_url}
                        onChange={(e) => setCompanySettings({...companySettings, logo_url: e.target.value})}
                        placeholder="https://example.com/logo.png"
                      />
                      {companySettings.logo_url && (
                        <div className="mt-2">
                          <img src={companySettings.logo_url} alt="Logo preview" className="h-16 object-contain" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving} className="gap-2">
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quick-links">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/materials'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-green-600" />
                    Material Management
                  </CardTitle>
                  <CardDescription>Manage material master data, categories, and units</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">{summary?.materials_count || 0} Materials</p>
                </CardContent>
              </Card>
              
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/vendor-management'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-purple-600" />
                    Vendor Management
                  </CardTitle>
                  <CardDescription>Manage vendor master data and payment terms</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-purple-600">{summary?.vendors_count || 0} Vendors</p>
                </CardContent>
              </Card>
              
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/users'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-orange-600" />
                    User Management
                  </CardTitle>
                  <CardDescription>Manage users and their role assignments</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-orange-600">{summary?.users_count || 0} Users</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
