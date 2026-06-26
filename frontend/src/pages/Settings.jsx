import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Settings as SettingsIcon, Users, Package, Truck, Save, Building, ArrowDownRight, GitBranch, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { NumericInput } from '../components/NumericInput';

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
    financial_year_start: 'April',
    indirect_cost_percent: 20
  });

  // CRE Module settings (Super Admin only)
  const [creModuleSettings, setCreModuleSettings] = useState({
    show_all_projects_tab: false,
    show_income_tab: false,
  });
  const [creSaving, setCreSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/settings/cre-module`).then(r => {
      setCreModuleSettings({
        show_all_projects_tab: !!r.data?.show_all_projects_tab,
        show_income_tab: !!r.data?.show_income_tab,
      });
    }).catch(() => {});
  }, []);

  const handleCreSettingChange = async (key, value) => {
    const next = { ...creModuleSettings, [key]: value };
    setCreModuleSettings(next);
    setCreSaving(true);
    try {
      await axios.patch(`${API}/settings/cre-module`, next);
      toast.success('CRE module settings updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
      // revert on failure
      setCreModuleSettings(creModuleSettings);
    } finally {
      setCreSaving(false);
    }
  };

  // Feb 26 2026 — Branding (Super Admin only).
  const [branding, setBranding] = useState(null);
  const [brandName, setBrandName] = useState('');
  const [brandSaving, setBrandSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/branding`).then(r => {
      setBranding(r.data);
      setBrandName(r.data?.app_name || '');
    }).catch(() => {});
  }, []);

  const saveBrandName = async () => {
    const n = (brandName || '').trim();
    if (!n) { toast.error('App name cannot be empty'); return; }
    setBrandSaving(true);
    try {
      const r = await axios.patch(`${API}/admin/branding`, { app_name: n });
      setBranding(r.data);
      try { document.title = n; } catch (e) { /* ignore */ }
      toast.success('App name updated.');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save app name');
    } finally { setBrandSaving(false); }
  };

  const uploadBrandAsset = async (slot, fileEvt) => {
    const f = fileEvt?.target?.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error('Max 2 MB'); return; }
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await axios.post(`${API}/admin/branding/upload?slot=${slot}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBranding(r.data);
      toast.success(`${slot === 'logo' ? 'Logo' : 'Favicon'} uploaded. New version live.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to upload ${slot}`);
    } finally {
      try { fileEvt.target.value = ''; } catch (e) { /* ignore */ }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
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
          financial_year_start: settingsRes.data.financial_year_start || 'April',
          indirect_cost_percent: settingsRes.data.indirect_cost_percent ?? 20
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
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to save settings');
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
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-8 flex-wrap gap-2">
          <div>
            <h2 data-testid="settings-title" className="text-xl sm:text-3xl font-bold text-gray-900">System Settings</h2>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage company profile, materials, and users</p>
          </div>
          <Button
            onClick={() => window.location.href = '/settings/slots'}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
            data-testid="settings-slots-link"
          >
            👥 Slot Management
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 cursor-pointer hover:shadow-md transition-shadow active:bg-amber-50" onClick={() => setActiveTab('company')}>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Company Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Building className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600" />
                <span className="text-xs sm:text-lg font-bold text-amber-700 truncate">{summary?.company_name || 'Not Set'}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 cursor-pointer hover:shadow-md transition-shadow active:bg-green-100" onClick={() => window.location.href = '/materials'}>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Materials</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
                <span className="text-lg sm:text-2xl font-bold text-green-700">{summary?.materials_count || 0}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 cursor-pointer hover:shadow-md transition-shadow active:bg-purple-100" onClick={() => window.location.href = '/vendor-management'}>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Vendors</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Truck className="h-4 w-4 sm:h-6 sm:w-6 text-purple-600" />
                <span className="text-lg sm:text-2xl font-bold text-purple-700">{summary?.vendors_count || 0}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 cursor-pointer hover:shadow-md transition-shadow active:bg-orange-100" onClick={() => window.location.href = '/users'}>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Users</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Users className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600" />
                <span className="text-lg sm:text-2xl font-bold text-orange-700">{summary?.users_count || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 sm:mb-6 w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="company" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Building className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Company</span> Profile
            </TabsTrigger>
            <TabsTrigger value="quick-links" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <SettingsIcon className="h-3 w-3 sm:h-4 sm:w-4" /> Quick Links
            </TabsTrigger>
            {user?.role === 'super_admin' && (
              <TabsTrigger value="cre-module" className="gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="settings-cre-module-tab">
                <Headphones className="h-3 w-3 sm:h-4 sm:w-4" /> CRE Module
              </TabsTrigger>
            )}
            {user?.role === 'super_admin' && (
              <TabsTrigger value="branding" className="gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="settings-branding-tab">
                <Building2 className="h-3 w-3 sm:h-4 sm:w-4" /> Branding
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="company">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Company Profile</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Configure your company information that appears across the system</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <form onSubmit={handleSaveCompanySettings} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
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
                    <div className="space-y-2">
                      <Label htmlFor="indirect_cost_percent">Indirect Cost %</Label>
                      <div className="flex items-center gap-3">
                        <NumericInput
                          id="indirect_cost_percent"
                          
                          min="1"
                          max="50"
                          step="1"
                          data-testid="indirect-cost-percent-input"
                          value={companySettings.indirect_cost_percent}
                          onChange={(e) => setCompanySettings({...companySettings, indirect_cost_percent: parseFloat(e.target.value) || 0})}
                          className="w-24"
                        />
                        <div className="flex-1 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                          <span className="font-semibold text-blue-700">Direct: {100 - (companySettings.indirect_cost_percent || 0)}%</span>
                          <span className="mx-2">|</span>
                          <span className="font-semibold text-violet-700">Indirect: {companySettings.indirect_cost_percent || 0}%</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Split of project value between direct costs and indirect/overhead costs</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              <Card className="hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50" onClick={() => window.location.href = '/packages'}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Package className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                    Package Management
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Define project packages with scope, materials & labour</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <p className="text-xl sm:text-2xl font-bold text-indigo-600">Packages A, B, C</p>
                </CardContent>
              </Card>
              
              <Card className="hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50" onClick={() => window.location.href = '/materials'}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Package className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                    Material Management
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage material master data, categories, and units</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <p className="text-xl sm:text-2xl font-bold text-green-600">{summary?.materials_count || 0} Materials</p>
                </CardContent>
              </Card>
              
              <Card className="hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50" onClick={() => window.location.href = '/vendor-management'}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                    Vendor Management
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage vendor master data and payment terms</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <p className="text-xl sm:text-2xl font-bold text-purple-600">{summary?.vendors_count || 0} Vendors</p>
                </CardContent>
              </Card>
              
              <Card className="hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50 sm:col-span-2 lg:col-span-1" onClick={() => window.location.href = '/users'}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
                    User Management
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage users and their role assignments</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <p className="text-xl sm:text-2xl font-bold text-orange-600">{summary?.users_count || 0} Users</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50" onClick={() => window.location.href = '/settings/stages?type=pre_sales'} data-testid="quick-link-presales-stages">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                    Pre-Sales Stages
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage pipeline stages for the pre-sales CRM module</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <p className="text-xl sm:text-2xl font-bold text-indigo-600">Pipeline Config</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50" onClick={() => window.location.href = '/settings/stages?type=sales'} data-testid="quick-link-sales-stages">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <GitBranch className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                    Sales Stages
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage pipeline stages for the sales CRM module</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600">Pipeline Config</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ────────── CRE Module Settings (Super Admin) ────────── */}
          {user?.role === 'super_admin' && (
            <TabsContent value="cre-module">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Headphones className="h-5 w-5 text-amber-600" /> CRE Module
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Control which optional tabs appear on every CRE Board. Changes apply to all CRE users immediately.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                  <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-slate-50">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Show "All Projects" tab</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        When ON, every CRE sees a full project listing tab on their board. Turn this OFF to keep CREs focused on Payment Schedule, Final Estimate and DT-level work.
                      </p>
                    </div>
                    <Switch
                      checked={creModuleSettings.show_all_projects_tab}
                      onCheckedChange={(v) => handleCreSettingChange('show_all_projects_tab', v)}
                      disabled={creSaving}
                      data-testid="settings-toggle-all-projects"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-slate-50">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Show "Income" tab</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        When ON, every CRE sees an income-history tab listing approved/rejected income records. Turn this OFF for a leaner workflow.
                      </p>
                    </div>
                    <Switch
                      checked={creModuleSettings.show_income_tab}
                      onCheckedChange={(v) => handleCreSettingChange('show_income_tab', v)}
                      disabled={creSaving}
                      data-testid="settings-toggle-income"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 pt-2 border-t">
                    Settings are saved instantly. CRE users will see the change on their next page load.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {user?.role === 'super_admin' && (
            <TabsContent value="branding">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-indigo-600" /> App Branding
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Change the app name, login logo, and favicon. New images take effect immediately for everyone (browsers will auto-bust the cache via a version query string).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-name-input" className="text-sm">App Name</Label>
                    <div className="flex gap-2">
                      <Input
                        id="brand-name-input"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="My Home USB"
                        maxLength={80}
                        data-testid="branding-name-input"
                      />
                      <Button onClick={saveBrandName} disabled={brandSaving} data-testid="branding-name-save">
                        <Save className="h-4 w-4 mr-1" /> {brandSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-gray-500">Shown on the browser tab, login screen, and sidebar header.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4 bg-slate-50">
                      <p className="text-sm font-semibold mb-2">Login Logo</p>
                      <div className="h-24 w-24 mx-auto rounded-md bg-white border flex items-center justify-center overflow-hidden">
                        {branding?.logo_url && (
                          <img src={branding.logo_url} alt="logo" className="max-h-full max-w-full object-contain" data-testid="branding-logo-preview" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-2 text-center">Recommended: 500 × 500 PNG / WebP, ≤ 2 MB</p>
                      <Input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => uploadBrandAsset('logo', e)} className="mt-2" data-testid="branding-logo-upload" />
                    </div>
                    <div className="rounded-lg border p-4 bg-slate-50">
                      <p className="text-sm font-semibold mb-2">Favicon</p>
                      <div className="h-24 w-24 mx-auto rounded-md bg-white border flex items-center justify-center overflow-hidden">
                        {branding?.favicon_url && (
                          <img src={branding.favicon_url} alt="favicon" className="max-h-full max-w-full object-contain" data-testid="branding-favicon-preview" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-2 text-center">Recommended: 512 × 512 PNG, ≤ 2 MB (used for browser tab + PWA install)</p>
                      <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadBrandAsset('favicon', e)} className="mt-2" data-testid="branding-favicon-upload" />
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-400 pt-2 border-t">
                    Last updated: {branding?.updated_at ? new Date(branding.updated_at).toLocaleString() : '—'} · Logo v{branding?.logo_version ?? 0} · Favicon v{branding?.favicon_version ?? 0}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
