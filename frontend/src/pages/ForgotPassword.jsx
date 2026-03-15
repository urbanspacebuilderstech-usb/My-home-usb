import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { toast.error('Please enter your email'); return; }
    setIsLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email });
      setSent(true);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <Card className="w-full max-w-md border-2 border-primary" data-testid="forgot-password-card">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="bg-primary p-3 rounded-sm">
              <Building2 className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>
            {sent ? 'Check your email for the reset link' : 'Enter your email to receive a reset link'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {sent ? (
            <div className="text-center space-y-4" data-testid="reset-sent-message">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                If an account exists with <strong>{email}</strong>, we've sent a password reset link. Check your inbox.
              </p>
              <Link to="/login">
                <Button variant="outline" className="mt-4" data-testid="back-to-login-btn">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    data-testid="forgot-email-input"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>

              <Button type="submit" data-testid="send-reset-btn" disabled={isLoading} className="w-full h-11 font-bold">
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-primary hover:underline" data-testid="back-link">
                  <ArrowLeft className="w-3 h-3 inline mr-1" /> Back to Login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
