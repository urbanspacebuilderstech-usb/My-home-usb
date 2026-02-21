import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AuthCallback() {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      try {
        // Extract session_id from URL hash
        const hash = window.location.hash;
        const sessionIdMatch = hash.match(/session_id=([^&]+)/);
        
        if (!sessionIdMatch) {
          toast.error('Invalid authentication response');
          navigate('/login', { replace: true });
          return;
        }

        const sessionId = sessionIdMatch[1];

        // Exchange session_id for session_token
        const response = await axios.post(`${API}/auth/session`, {}, {
          headers: {
            'X-Session-ID': sessionId
          },
          withCredentials: true
        });

        const user = response.data;
        
        // Update user status from 'invited' to 'active' if first login
        if (user.status === 'invited') {
          // Backend handles this automatically
        }

        toast.success(`Welcome, ${user.name}!`);
        
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
        
        // Navigate based on role
        if (user.role === 'client') {
          navigate('/client-portal', { state: { user }, replace: true });
        } else {
          navigate('/dashboard', { state: { user }, replace: true });
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        const errorMessage = error.response?.data?.detail || 'Authentication failed. Please try again.';
        toast.error(errorMessage);
        navigate('/login', { replace: true });
      }
    };

    processAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <RefreshCw className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-lg font-semibold text-gray-700">Authenticating...</p>
      <p className="text-sm text-gray-500 mt-2">Please wait while we verify your account</p>
    </div>
  );
}
