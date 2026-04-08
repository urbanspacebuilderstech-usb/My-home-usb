import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { User, Shield, Lock, Phone, Mail, Briefcase, Loader2, CheckCircle, XCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
axios.defaults.withCredentials = true;

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  // Basic info edit
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // 2FA states
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [setupStep, setSetupStep] = useState(0); // 0: idle, 1: password, 2: QR, 3: verify
  const [setupPassword, setSetupPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // Disable 2FA
  const [disableStep, setDisableStep] = useState(0); // 0: idle, 1: form
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  // Change Password
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [changePassLoading, setChangePassLoading] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API}/auth/profile`);
      setUser(res.data);
      setEditName(res.data.name || '');
      setEditPhone(res.data.phone || '');
      setTwoFAEnabled(res.data.two_factor_enabled || false);
    } catch {
      toast.error('Failed to load profile');
      navigate(-1);
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await axios.put(`${API}/auth/profile`, { name: editName, phone: editPhone });
      toast.success('Profile updated');
      fetchProfile();
    } catch (e) { toast.error(e.response?.data?.detail || 'Update failed'); }
    setSavingProfile(false);
  };

  // 2FA Setup Flow
  const handleSetupStart = async () => {
    if (!setupPassword) { toast.error('Enter your password'); return; }
    setSetupLoading(true);
    try {
      const res = await axios.post(`${API}/auth/2fa/setup`, { password: setupPassword });
      setQrCode(res.data.qr_code);
      setTotpSecret(res.data.secret);
      setSetupStep(2);
    } catch (e) { toast.error(e.response?.data?.detail || 'Setup failed'); }
    setSetupLoading(false);
  };

  const handleVerify2FA = async () => {
    if (!verifyCode || verifyCode.length !== 6) { toast.error('Enter 6-digit code'); return; }
    setSetupLoading(true);
    try {
      await axios.post(`${API}/auth/2fa/verify`, { code: verifyCode });
      toast.success('2FA enabled successfully!');
      setTwoFAEnabled(true);
      setSetupStep(0);
      setSetupPassword('');
      setQrCode('');
      setTotpSecret('');
      setVerifyCode('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Verification failed'); }
    setSetupLoading(false);
  };

  const handleDisable2FA = async () => {
    if (!disablePassword || !disableCode) { toast.error('Enter password and 2FA code'); return; }
    setDisableLoading(true);
    try {
      await axios.post(`${API}/auth/2fa/disable`, { password: disablePassword, code: disableCode });
      toast.success('2FA disabled');
      setTwoFAEnabled(false);
      setDisableStep(0);
      setDisablePassword('');
      setDisableCode('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to disable 2FA'); }
    setDisableLoading(false);
  };

  const handleChangePassword = async () => {
    if (!currentPass) { toast.error('Enter current password'); return; }
    if (!newPass || newPass.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPass !== confirmPass) { toast.error('Passwords do not match'); return; }
    setChangePassLoading(true);
    try {
      await axios.post(`${API}/auth/change-password`, { current_password: currentPass, new_password: newPass });
      toast.success('Password changed successfully');
      setShowChangePass(false);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to change password'); }
    setChangePassLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" className="mb-4 gap-1 text-gray-500" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
            <User className="h-7 w-7 text-amber-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900" data-testid="profile-name">{user?.name}</h1>
            <Badge variant="outline" className="text-xs capitalize">{user?.role?.replace(/_/g, ' ')}</Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-sm mb-4">
            <TabsTrigger value="info" data-testid="tab-basic-info">Basic Info</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="info">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                  <Input value={user?.email || ''} disabled className="mt-1 bg-gray-50" data-testid="profile-email" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Email cannot be changed</p>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> Name</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" data-testid="profile-name-input" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                  <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="mt-1" data-testid="profile-phone-input" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Briefcase className="h-3 w-3" /> Role</Label>
                  <Input value={user?.role?.replace(/_/g, ' ')} disabled className="mt-1 bg-gray-50 capitalize" />
                </div>
                <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full" data-testid="save-profile-btn">
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            {/* Change Password Section */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-600" /> Change Password
                </CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent>
                {!showChangePass ? (
                  <Button variant="outline" onClick={() => setShowChangePass(true)} className="w-full" data-testid="change-password-btn">
                    Change Password
                  </Button>
                ) : (
                  <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                    <div>
                      <Label className="text-xs">Current Password</Label>
                      <div className="relative mt-1">
                        <Input
                          type={showCurrentPass ? 'text' : 'password'}
                          value={currentPass}
                          onChange={e => setCurrentPass(e.target.value)}
                          placeholder="Enter current password"
                          data-testid="current-password-input"
                        />
                        <button type="button" className="absolute right-2 top-2 text-gray-400" onClick={() => setShowCurrentPass(!showCurrentPass)}>
                          {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">New Password</Label>
                      <div className="relative mt-1">
                        <Input
                          type={showNewPass ? 'text' : 'password'}
                          value={newPass}
                          onChange={e => setNewPass(e.target.value)}
                          placeholder="Enter new password (min 6 characters)"
                          data-testid="new-password-input"
                        />
                        <button type="button" className="absolute right-2 top-2 text-gray-400" onClick={() => setShowNewPass(!showNewPass)}>
                          {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Confirm New Password</Label>
                      <Input
                        type="password"
                        value={confirmPass}
                        onChange={e => setConfirmPass(e.target.value)}
                        placeholder="Re-enter new password"
                        className="mt-1"
                        data-testid="confirm-password-input"
                        onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                      />
                      {confirmPass && newPass !== confirmPass && (
                        <p className="text-[10px] text-red-500 mt-0.5">Passwords do not match</p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" onClick={() => { setShowChangePass(false); setCurrentPass(''); setNewPass(''); setConfirmPass(''); }}>Cancel</Button>
                      <Button onClick={handleChangePassword} disabled={changePassLoading} className="flex-1" data-testid="save-password-btn">
                        {changePassLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2FA Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" /> Two-Factor Authentication
                </CardTitle>
                <CardDescription>Add an extra layer of security using Google Authenticator</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Status */}
                <div className="flex items-center gap-3 p-3 rounded-lg mb-4 border" data-testid="2fa-status">
                  {twoFAEnabled ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-green-700">2FA is Enabled</p>
                        <p className="text-xs text-gray-500">Your account is protected with Google Authenticator</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-600">2FA is Disabled</p>
                        <p className="text-xs text-gray-400">Enable 2FA to secure your account</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Enable 2FA Flow */}
                {!twoFAEnabled && (
                  <div className="space-y-4">
                    {setupStep === 0 && (
                      <Button onClick={() => setSetupStep(1)} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="enable-2fa-btn">
                        <Shield className="h-4 w-4 mr-2" /> Enable 2FA
                      </Button>
                    )}

                    {/* Step 1: Password */}
                    {setupStep === 1 && (
                      <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
                        <h4 className="text-sm font-semibold">Step 1: Verify your password</h4>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            value={setupPassword}
                            onChange={e => setSetupPassword(e.target.value)}
                            placeholder="Enter your current password"
                            data-testid="2fa-password-input"
                            onKeyDown={e => e.key === 'Enter' && handleSetupStart()}
                          />
                          <button type="button" className="absolute right-2 top-2 text-gray-400" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => { setSetupStep(0); setSetupPassword(''); }}>Cancel</Button>
                          <Button onClick={handleSetupStart} disabled={setupLoading} data-testid="2fa-verify-password-btn">
                            {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: QR Code */}
                    {setupStep === 2 && (
                      <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
                        <h4 className="text-sm font-semibold">Step 2: Scan QR Code with Google Authenticator</h4>
                        <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                          <li>Open Google Authenticator on your phone</li>
                          <li>Tap the "+" button to add a new account</li>
                          <li>Select "Scan a QR code" and scan below</li>
                        </ol>
                        <div className="flex justify-center p-4 bg-white rounded-lg border">
                          {qrCode && <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" data-testid="2fa-qr-code" />}
                        </div>
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                          <p className="font-medium text-amber-700 mb-1">Can't scan? Enter this key manually:</p>
                          <code className="text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px] break-all select-all" data-testid="2fa-manual-key">{totpSecret}</code>
                        </div>
                        <Button onClick={() => setSetupStep(3)} className="w-full" data-testid="2fa-next-verify-btn">
                          I've scanned the QR code
                        </Button>
                      </div>
                    )}

                    {/* Step 3: Verify Code */}
                    {setupStep === 3 && (
                      <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
                        <h4 className="text-sm font-semibold">Step 3: Enter verification code</h4>
                        <p className="text-xs text-gray-500">Enter the 6-digit code from Google Authenticator</p>
                        <Input
                          value={verifyCode}
                          onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          maxLength={6}
                          className="text-center text-2xl tracking-[0.5em] font-mono"
                          data-testid="2fa-verify-code-input"
                          onKeyDown={e => e.key === 'Enter' && handleVerify2FA()}
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setSetupStep(2)}>Back</Button>
                          <Button onClick={handleVerify2FA} disabled={setupLoading || verifyCode.length !== 6} className="flex-1" data-testid="2fa-verify-btn">
                            {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Enable'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Disable 2FA */}
                {twoFAEnabled && (
                  <div className="space-y-3">
                    {disableStep === 0 && (
                      <Button variant="outline" className="w-full text-red-600 border-red-300 hover:bg-red-50" onClick={() => setDisableStep(1)} data-testid="disable-2fa-btn">
                        Disable 2FA
                      </Button>
                    )}
                    {disableStep === 1 && (
                      <div className="border border-red-200 rounded-lg p-4 space-y-3 bg-red-50">
                        <h4 className="text-sm font-semibold text-red-700">Disable 2FA</h4>
                        <div>
                          <Label className="text-xs">Password</Label>
                          <Input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} placeholder="Enter password" className="mt-1" data-testid="disable-2fa-password" />
                        </div>
                        <div>
                          <Label className="text-xs">Current 2FA Code</Label>
                          <Input value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} className="mt-1 text-center font-mono tracking-widest" data-testid="disable-2fa-code" />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => { setDisableStep(0); setDisablePassword(''); setDisableCode(''); }}>Cancel</Button>
                          <Button variant="destructive" onClick={handleDisable2FA} disabled={disableLoading} data-testid="disable-2fa-confirm-btn">
                            {disableLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable 2FA'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
