import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEMO_USERS = [
  { email: 'admin@constructionos.com', name: 'Super Admin', role: 'super_admin' },
  { email: 'gm@constructionos.com', name: 'General Manager (Suresh)', role: 'general_manager' },
  { email: 'cro@constructionos.com', name: 'CRO (Anita)', role: 'cro' },
  { email: 'accountant@constructionos.com', name: 'Accountant (Priya)', role: 'accountant' },
  { email: 'pm@constructionos.com', name: 'Project Manager (Rajesh)', role: 'project_manager' },
  { email: 'planning@constructionos.com', name: 'Planning (Amit)', role: 'planning' },
  { email: 'procurement@constructionos.com', name: 'Procurement (Sneha)', role: 'procurement' },
  { email: 'engineer@constructionos.com', name: 'Site Engineer (Vikram)', role: 'site_engineer' },
  { email: 'raj@client.com', name: 'Client (Mr. Raj)', role: 'client' },
];

export default function Login() {
  const navigate = useNavigate();
  const [selectedEmail, setSelectedEmail] = useState('admin@constructionos.com');
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoLogin = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/auth/demo-login`, {
        email: selectedEmail
      }, {
        withCredentials: true
      });

      const user = response.data;
      toast.success(`Welcome, ${user.name}!`);
      navigate('/dashboard', { state: { user }, replace: true });
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
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
          <div className="bg-accent/50 border border-primary/20 rounded p-4 mb-6">
            <p className="text-xs font-semibold text-center mb-2 uppercase tracking-wide">Demo Mode</p>
            <p className="text-xs text-center text-muted-foreground">
              Select any role to explore the system instantly
            </p>
          </div>

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

          <div className="border-t pt-4">
            <p className="text-xs text-center text-muted-foreground mb-2">Quick Access:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Super Admin', email: 'admin@constructionos.com' },
                { label: 'Accountant', email: 'accountant@constructionos.com' },
                { label: 'PM', email: 'pm@constructionos.com' },
                { label: 'Client', email: 'raj@client.com' },
              ].map((quick) => (
                <Button
                  key={quick.email}
                  data-testid={`quick-${quick.label.toLowerCase().replace(' ', '-')}`}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setSelectedEmail(quick.email);
                    setTimeout(() => handleDemoLogin(), 100);
                  }}
                  disabled={isLoading}
                >
                  {quick.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
