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

              <p className="text-xs text-center text-muted-foreground mt-4">
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
