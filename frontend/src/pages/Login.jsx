import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEMO_USERS = [
  { email: 'admin@constructionos.com', name: 'Super Admin', role: 'super_admin' },
  { email: 'gm@constructionos.com', name: 'General Manager (Suresh)', role: 'general_manager' },
  { email: 'cro@constructionos.com', name: 'CRE (Anita)', role: 'cre' },
  { email: 'accountant@constructionos.com', name: 'Accountant (Priya)', role: 'accountant' },
  { email: 'pm@constructionos.com', name: 'Project Manager (Rajesh)', role: 'project_manager' },
  { email: 'planning@constructionos.com', name: 'Planning (Amit)', role: 'planning' },
  { email: 'procurement@constructionos.com', name: 'Procurement (Sneha)', role: 'procurement' },
  { email: 'engineer@constructionos.com', name: 'Site Engineer (Vikram)', role: 'site_engineer' },
  { email: 'presales@constructionos.com', name: 'Pre-Sales (Priya)', role: 'pre_sales' },
  { email: 'sales@constructionos.com', name: 'Sales (Sameer)', role: 'sales' },
  { email: 'raj@client.com', name: 'Client (Mr. Raj)', role: 'client' },
  { email: 'mohan@client.com', name: 'Client (Mr. Mohan)', role: 'client' },
];

export default function Login() {
  const navigate = useNavigate();
  const [selectedEmail, setSelectedEmail] = useState('admin@constructionos.com');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleDemoLogin = async (emailOverride = null) => {
    const emailToUse = (typeof emailOverride === 'string') ? emailOverride : selectedEmail;
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/auth/demo-login`, {
        email: emailToUse
      }, {
        withCredentials: true
      });

      const user = response.data;
      toast.success(`Welcome, ${user.name}!`);
      
      if (user.role === 'client') {
        navigate('/client-portal', { state: { user }, replace: true });
      } else {
        navigate('/dashboard', { state: { user }, replace: true });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('https://images.unsplash.com/photo-1644411813513-ad77c1b77581?crop=entropy&cs=srgb&fm=jpg&q=85')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <Card className="w-full max-w-md border-2 border-primary">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-4 rounded-sm">
              <Building2 className="w-12 h-12 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">ConstructionOS</CardTitle>
          <CardDescription className="text-sm font-semibold uppercase tracking-wider">
            Project Control & Accounting System
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Google Login Section */}
          <div className="space-y-4">
            <Button 
              data-testid="google-login-btn"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full h-12 text-base font-bold bg-white text-gray-800 hover:bg-gray-100 border border-gray-300"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Login with Google
            </Button>
            
            <p className="text-xs text-center text-muted-foreground">
              Only invited users can login. Contact your administrator for access.
            </p>
          </div>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              OR
            </span>
          </div>

          {/* Demo Login Section */}
          <div className="bg-accent/50 border border-primary/20 rounded p-4">
            <p className="text-xs font-semibold text-center mb-2 uppercase tracking-wide">Demo Mode</p>
            <p className="text-xs text-center text-muted-foreground mb-4">
              Select any role to explore the system instantly
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="demo-user" className="text-sm font-semibold mb-2 block">
                  Select Demo User
                </Label>
                <Select value={selectedEmail} onValueChange={setSelectedEmail}>
                  <SelectTrigger data-testid="demo-user-select" id="demo-user" className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEMO_USERS.map((user) => (
                      <SelectItem key={user.email} value={user.email}>
                        <div className="flex flex-col">
                          <span className="font-semibold">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                data-testid="demo-login-btn"
                onClick={handleDemoLogin}
                disabled={isLoading}
                className="w-full h-12 text-base font-bold uppercase tracking-wide"
              >
                {isLoading ? 'Logging in...' : 'Login as Demo User'}
              </Button>
            </div>

            <div className="border-t mt-4 pt-4">
              <p className="text-xs text-center text-muted-foreground mb-2">Quick Access:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Super Admin', email: 'admin@constructionos.com' },
                  { label: 'GM', email: 'gm@constructionos.com' },
                  { label: 'Accountant', email: 'accountant@constructionos.com' },
                  { label: 'Planning', email: 'planning@constructionos.com' },
                  { label: 'Pre-Sales', email: 'presales@constructionos.com' },
                  { label: 'Sales', email: 'sales@constructionos.com' },
                  { label: 'PM', email: 'pm@constructionos.com' },
                  { label: 'Client (Mohan)', email: 'mohan@client.com' },
                ].map((quick) => (
                  <Button
                    key={quick.email}
                    data-testid={`quick-${quick.label.toLowerCase().replace(' ', '-').replace('(', '').replace(')', '')}`}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSelectedEmail(quick.email);
                      handleDemoLogin(quick.email);
                    }}
                    disabled={isLoading}
                  >
                    {quick.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
