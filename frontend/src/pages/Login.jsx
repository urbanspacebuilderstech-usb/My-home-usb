import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Login() {
  const handleLogin = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
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
      <div className="bg-white rounded-sm shadow-lg p-8 md:p-12 max-w-md w-full border-2 border-primary">
        <div className="flex items-center justify-center mb-8">
          <div className="bg-primary p-4 rounded-sm">
            <Building2 className="w-12 h-12 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-2 tracking-tight">ConstructionOS</h1>
        <p className="text-center text-muted-foreground mb-8 text-sm">PROJECT CONTROL & ACCOUNTING SYSTEM</p>
        
        <Button 
          data-testid="google-login-btn"
          onClick={handleLogin} 
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wide h-12"
        >
          Sign In with Google
        </Button>
        
        <p className="text-xs text-center text-muted-foreground mt-6">
          Secure authentication powered by Emergent
        </p>
      </div>
    </div>
  );
}