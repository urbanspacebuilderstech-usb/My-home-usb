import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
];

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginTab, setLoginTab] = useState('password');

  // Real login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Demo login state
  const [selectedEmail, setSelectedEmail] = useState('admin@constructionos.com');

  const handleGoogleLogin = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

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
      if (user.role === 'client') {
        navigate('/client-portal', { state: { user }, replace: true });
      } else {
        navigate('/dashboard', { state: { user }, replace: true });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
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
      if (user.role === 'client') {
        navigate('/client-portal', { state: { user }, replace: true });
      } else {
        navigate('/dashboard', { state: { user }, replace: true });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.65)), url('https://images.unsplash.com/photo-1644411813513-ad77c1b77581?crop=entropy&cs=srgb&fm=jpg&q=85')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <Card className="w-full max-w-md border-2 border-primary" data-testid="login-card">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="bg-primary p-3 rounded-sm">
              <Building2 className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">ConstructionOS</CardTitle>
          <CardDescription className="text-xs font-semibold uppercase tracking-wider">
            Project Control & Accounting System
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs value={loginTab} onValueChange={setLoginTab}>
            <TabsList className="grid w-full grid-cols-2" data-testid="login-tabs">
              <TabsTrigger value="password" data-testid="tab-password">Login</TabsTrigger>
              <TabsTrigger value="demo" data-testid="tab-demo">Demo Access</TabsTrigger>
            </TabsList>

            {/* Real Login Tab */}
            <TabsContent value="password" className="space-y-4 mt-4">
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      data-testid="email-input"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline" data-testid="forgot-password-link">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      data-testid="password-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
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
                  className="w-full h-11 text-base font-bold"
                >
                  {isLoading ? 'Logging in...' : 'Login'}
                </Button>
              </form>

              <div className="relative my-2">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  OR
                </span>
              </div>

              <Button
                data-testid="google-login-btn"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                variant="outline"
                className="w-full h-11 text-sm font-semibold"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Login with Google
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Only invited users can login. Contact your admin for access.
              </p>
            </TabsContent>

            {/* Demo Tab */}
            <TabsContent value="demo" className="space-y-4 mt-4">
              <div className="bg-accent/50 border border-primary/20 rounded p-4">
                <p className="text-xs font-semibold text-center mb-3 uppercase tracking-wide">Demo Mode</p>

                <div className="space-y-3">
                  <Select value={selectedEmail} onValueChange={setSelectedEmail}>
                    <SelectTrigger data-testid="demo-user-select" className="h-11">
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
                    className="w-full h-11 font-bold"
                  >
                    {isLoading ? 'Logging in...' : 'Login as Demo User'}
                  </Button>
                </div>

                <div className="border-t mt-3 pt-3">
                  <p className="text-xs text-center text-muted-foreground mb-2">Quick Access:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DEMO_USERS.slice(0, 8).map((quick) => (
                      <Button
                        key={quick.email}
                        data-testid={`quick-${quick.name.toLowerCase().replace(/\s/g, '-')}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
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
        </CardContent>
      </Card>
    </div>
  );
}
