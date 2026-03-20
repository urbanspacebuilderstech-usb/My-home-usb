import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Building2, User, Mail, Phone, Lock, ArrowRight, Check, Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [setupLocked, setSetupLocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    admin_name: '',
    admin_email: '',
    admin_phone: '',
    admin_password: '',
    confirm_password: '',
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      await axios.get(`${API}/auth/setup-status`);
      // Setup page always accessible for creating super admins
    } catch {
      // Allow setup regardless
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return; }
    if (!form.admin_name.trim()) { toast.error('Your name is required'); return; }
    if (!form.admin_email.trim() || !form.admin_email.includes('@')) { toast.error('Valid email is required'); return; }
    if (form.admin_password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (form.admin_password !== form.confirm_password) { toast.error('Passwords do not match'); return; }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/initial-setup`, {
        company_name: form.company_name.trim(),
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim(),
        admin_phone: form.admin_phone.trim(),
        admin_password: form.admin_password,
      });
      toast.success('Setup complete! Welcome aboard.');
      setStep(3);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-sm">Checking setup status...</div>
      </div>
    );
  }

  if (setupLocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" data-testid="setup-locked">
        <Card className="max-w-md w-full border-0 shadow-2xl text-center">
          <CardContent className="py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Setup Already Complete</h2>
            <p className="text-gray-500 mb-4">A Super Admin account already exists. This page is locked.</p>
            <div className="flex flex-col gap-3 items-center">
              <Button onClick={() => navigate('/login')} className="bg-slate-900 hover:bg-slate-800" data-testid="go-to-login-btn">
                Go to Login
              </Button>
              <button onClick={() => navigate('/forgot-password')} className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline" data-testid="setup-forgot-password-link">
                Forgot Password?
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" data-testid="setup-wizard">
      <div className="w-full max-w-lg">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to Your Construction OS</h1>
          <p className="text-slate-400 mt-2 text-sm">Set up your Super Admin account in just a minute</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step > s ? 'bg-green-500 text-white' :
                step === s ? 'bg-white text-slate-900' :
                'bg-slate-700 text-slate-400'
              }`}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-green-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Company Info */}
        {step === 1 && (
          <Card className="border-0 shadow-2xl" data-testid="setup-step-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" />
                Company Details
              </CardTitle>
              <p className="text-sm text-gray-500">Tell us about your company</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="company_name">Company Name *</Label>
                <Input
                  id="company_name"
                  placeholder="e.g. Urban Space Builders"
                  value={form.company_name}
                  onChange={e => update('company_name', e.target.value)}
                  className="mt-1"
                  data-testid="setup-company-name"
                />
              </div>
              <Button
                className="w-full bg-slate-900 hover:bg-slate-800"
                onClick={() => {
                  if (!form.company_name.trim()) { toast.error('Company name is required'); return; }
                  setStep(2);
                }}
                data-testid="setup-next-btn"
              >
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Admin Account */}
        {step === 2 && (
          <Card className="border-0 shadow-2xl" data-testid="setup-step-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                Super Admin Account
              </CardTitle>
              <p className="text-sm text-gray-500">Create your administrator login</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="admin_name">Full Name *</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input id="admin_name" placeholder="Your full name" value={form.admin_name} onChange={e => update('admin_name', e.target.value)} className="pl-10" data-testid="setup-admin-name" />
                </div>
              </div>
              <div>
                <Label htmlFor="admin_email">Email *</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input id="admin_email" type="email" placeholder="admin@yourcompany.com" value={form.admin_email} onChange={e => update('admin_email', e.target.value)} className="pl-10" data-testid="setup-admin-email" />
                </div>
              </div>
              <div>
                <Label htmlFor="admin_phone">Phone (Optional)</Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input id="admin_phone" placeholder="+91 98765 43210" value={form.admin_phone} onChange={e => update('admin_phone', e.target.value)} className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="admin_password">Password *</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input id="admin_password" type={showPassword ? 'text' : 'password'} placeholder="Min 6 characters" value={form.admin_password} onChange={e => update('admin_password', e.target.value)} className="pl-10 pr-10" data-testid="setup-admin-password" />
                  <button type="button" className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600" onClick={() => setShowPassword(!showPassword)} data-testid="setup-toggle-password">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="confirm_password">Confirm Password *</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input id="confirm_password" type={showConfirmPassword ? 'text' : 'password'} placeholder="Re-enter password" value={form.confirm_password} onChange={e => update('confirm_password', e.target.value)} className="pl-10 pr-10" data-testid="setup-confirm-password" />
                  <button type="button" className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600" onClick={() => setShowConfirmPassword(!showConfirmPassword)} data-testid="setup-toggle-confirm-password">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={loading}
                  data-testid="setup-submit-btn"
                >
                  {loading ? 'Setting up...' : 'Complete Setup'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <Card className="border-0 shadow-2xl text-center" data-testid="setup-step-3">
            <CardContent className="py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">You're All Set!</h2>
              <p className="text-gray-500 mb-1">{form.company_name} is ready to go.</p>
              <p className="text-sm text-gray-400">Redirecting to your dashboard...</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Powered by Construction OS
        </p>
      </div>
    </div>
  );
}
