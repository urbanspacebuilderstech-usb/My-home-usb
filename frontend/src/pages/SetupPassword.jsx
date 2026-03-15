import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Building2, Lock, Eye, EyeOff, User, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [inviteData, setInviteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); setError('No invitation token'); return; }
    const verify = async () => {
      try {
        const res = await axios.get(`${API}/auth/verify-invitation/${token}`);
        setInviteData(res.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid invitation link');
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Please enter your name'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setIsSubmitting(true);
    try {
      await axios.post(`${API}/auth/setup-password`, { token, name: name.trim(), password });
      setDone(true);
      toast.success('Account setup complete!');
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Setup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
        <Card className="w-full max-w-md border-2 border-destructive">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
            <p className="font-semibold">Invalid Invitation</p>
            <p className="text-sm text-muted-foreground">{error || 'This link is invalid or has expired.'}</p>
            <p className="text-xs text-muted-foreground">Contact your administrator for a new invitation.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <Card className="w-full max-w-md border-2 border-primary" data-testid="setup-password-card">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="bg-primary p-3 rounded-sm">
              <Building2 className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Set Up Your Account</CardTitle>
          <CardDescription>
            {inviteData?.invited_by_name} invited you as {inviteData?.role?.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {done ? (
            <div className="text-center space-y-4" data-testid="setup-success">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <p className="font-semibold">Account Ready!</p>
              <p className="text-sm text-muted-foreground">Your account has been set up. You can now login.</p>
              <Link to="/login"><Button className="w-full h-11 font-bold" data-testid="goto-login-btn">Go to Login</Button></Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-accent/50 rounded p-3 text-center">
                <p className="text-sm text-muted-foreground">Setting up account for</p>
                <p className="font-semibold">{inviteData?.email}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Your Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    data-testid="setup-name-input"
                    type="text"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    data-testid="setup-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11"
                    required
                    minLength={8}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    data-testid="setup-confirm-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11"
                    required
                    minLength={8}
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              <Button type="submit" data-testid="setup-submit-btn" disabled={isSubmitting} className="w-full h-11 font-bold">
                {isSubmitting ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
