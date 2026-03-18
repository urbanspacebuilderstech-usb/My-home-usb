import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function getRoleRedirect(role) {
  const roleRoutes = {
    site_engineer: '/site-engineer',
    sr_site_engineer: '/site-engineer',
    pre_sales: '/crm-pre-sales',
    sales: '/crm-sales',
    general_manager: '/gm-dashboard',
    accountant: '/accounts-board',
    planning: '/planning-board',
    procurement: '/procurement-board-v2',
    cre: '/cre-board',
    project_manager: '/pm-dashboard',
    associate_pm: '/pm-dashboard',
    client: '/client-portal',
    vendor: '/vendor-portal',
    marketing_head: '/marketing-board',
    architect: '/architect-dashboard',
    super_admin: '/dashboard'
  };
  return roleRoutes[role] || '/dashboard';
}

const DEMO_USERS = [
  { email: 'admin@constructionos.com', name: 'Super Admin', role: 'super_admin' },
  { email: 'gm@constructionos.com', name: 'General Manager', role: 'general_manager' },
  { email: 'cre@constructionos.com', name: 'CRE', role: 'cre' },
  { email: 'accountant@constructionos.com', name: 'Accountant', role: 'accountant' },
  { email: 'pm@constructionos.com', name: 'Project Manager', role: 'project_manager' },
  { email: 'planning@constructionos.com', name: 'Planning', role: 'planning' },
  { email: 'procurement@constructionos.com', name: 'Procurement', role: 'procurement' },
  { email: 'engineer@constructionos.com', name: 'Site Engineer', role: 'site_engineer' },
  { email: 'presales@constructionos.com', name: 'Pre-Sales', role: 'pre_sales' },
  { email: 'sales@constructionos.com', name: 'Sales', role: 'sales' },
  { email: 'architect@constructionos.com', name: 'Architect', role: 'architect' },
  { email: 'raj@client.com', name: 'Mr. Raj (Client)', role: 'client' },
  { email: 'mohan@client.com', name: 'Mr. Mohan (Client)', role: 'client' },
];

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginTab, setLoginTab] = useState('password');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('admin@constructionos.com');

  // Check if setup is needed
  useEffect(() => {
    axios.get(`${API}/auth/setup-status`).then(res => {
      if (!res.data.setup_complete) {
        navigate('/setup', { replace: true });
      }
    }).catch(() => {});
  }, [navigate]);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true });
      const user = response.data;
      toast.success(`Welcome, ${user.name}!`);
      // Navigate directly to role-specific page
      const target = getRoleRedirect(user.role);
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (emailOverride = null) => {
    const emailToUse = (typeof emailOverride === 'string') ? emailOverride : selectedEmail;
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/auth/demo-login`, { email: emailToUse }, { withCredentials: true });
      const user = response.data;
      toast.success(`Welcome, ${user.name}!`);
      const target = getRoleRedirect(user.role);
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-white">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-120px] left-[-80px] w-[400px] h-[400px] rounded-full bg-amber-100/60 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[-60px] w-[350px] h-[350px] rounded-full bg-slate-200/70 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-50/40 blur-3xl" />
      </div>

      {/* Glassmorphism Card */}
      <div
        data-testid="login-card"
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/40 shadow-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        {/* Header / Branding */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <img
            src="/logo.webp"
            alt="Urban Space Builders"
            className="w-28 object-contain mb-3"
            style={{ mixBlendMode: 'multiply' }}
            data-testid="login-logo"
          />
          <h1
            className="text-3xl font-extrabold tracking-tight text-slate-800"
            data-testid="login-title"
          >
            My Home USB
          </h1>
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600/80 mt-1"
            data-testid="login-subtitle"
          >
            Powered by Urban Space Builders
          </p>
        </div>

        {/* Content */}
        <div className="px-6 pb-8 space-y-4">
          <Tabs value={loginTab} onValueChange={setLoginTab}>
            <TabsList className="grid w-full grid-cols-2 bg-white/50" data-testid="login-tabs">
              <TabsTrigger value="password" data-testid="tab-password">Login</TabsTrigger>
              <TabsTrigger value="demo" data-testid="tab-demo">Demo Access</TabsTrigger>
            </TabsList>

            {/* Password Login Tab */}
            <TabsContent value="password" className="space-y-4 mt-4">
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      data-testid="email-input"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 bg-white/70 border-slate-200/80 focus:border-amber-400 focus:ring-amber-400/20"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-slate-700 text-sm font-medium">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-amber-600 hover:text-amber-700 hover:underline" data-testid="forgot-password-link">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      data-testid="password-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11 bg-white/70 border-slate-200/80 focus:border-amber-400 focus:ring-amber-400/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                      data-testid="toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  data-testid="login-submit-btn"
                  disabled={isLoading}
                  className="w-full h-11 text-base font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-all duration-200"
                >
                  {isLoading ? 'Logging in...' : 'Login'}
                </Button>
              </form>

              <p className="text-xs text-center text-slate-400 mt-4">
                Only invited users can login. Contact your admin for access.
              </p>
            </TabsContent>

            {/* Demo Tab */}
            <TabsContent value="demo" className="space-y-4 mt-4">
              <div className="bg-white/40 border border-amber-200/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-center mb-3 uppercase tracking-wide text-slate-500">Demo Mode</p>

                <div className="space-y-3">
                  <Select value={selectedEmail} onValueChange={setSelectedEmail}>
                    <SelectTrigger data-testid="demo-user-select" className="h-11 bg-white/70 border-slate-200/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEMO_USERS.map((user) => (
                        <SelectItem key={user.email} value={user.email}>
                          <span className="font-semibold">{user.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{user.email}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    data-testid="demo-login-btn"
                    onClick={() => handleDemoLogin()}
                    disabled={isLoading}
                    className="w-full h-11 font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-all duration-200"
                  >
                    {isLoading ? 'Logging in...' : 'Login as Demo User'}
                  </Button>
                </div>

                <div className="border-t border-slate-200/50 mt-3 pt-3">
                  <p className="text-xs text-center text-slate-400 mb-2">Quick Access:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DEMO_USERS.map((quick) => (
                      <Button
                        key={quick.email}
                        data-testid={`quick-${quick.name.toLowerCase().replace(/\s/g, '-')}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 bg-white/50 border-slate-200/60 hover:bg-amber-50 hover:border-amber-300 transition-all duration-150"
                        onClick={() => handleDemoLogin(quick.email)}
                        disabled={isLoading}
                      >
                        {quick.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
