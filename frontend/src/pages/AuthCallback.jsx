import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AuthCallback() {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const sessionId = params.get('session_id');

    if (!sessionId) {
      toast.error('Invalid authentication');
      navigate('/login');
      return;
    }

    const exchangeSession = async () => {
      try {
        const response = await axios.post(`${API}/auth/session`, null, {
          headers: { 'X-Session-ID': sessionId },
          withCredentials: true
        });

        const user = response.data;
        toast.success(`Welcome, ${user.name}!`);
        
        // Navigate based on role
        if (user.role === 'client') {
          navigate('/client-portal', { state: { user }, replace: true });
        } else {
          navigate('/dashboard', { state: { user }, replace: true });
        }
      } catch (error) {
        console.error('Auth error:', error);
        const errorMessage = error.response?.data?.detail || 'Authentication failed';
        
        // Show specific message for uninvited users
        if (error.response?.status === 403) {
          toast.error('Access Denied: You must be invited by an administrator to access this system.', {
            duration: 5000
          });
        } else {
          toast.error(errorMessage);
        }
        
        navigate('/login');
      }
    };

    exchangeSession();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
        <p className="mt-4 text-lg font-semibold text-gray-700">Authenticating...</p>
        <p className="text-sm text-gray-500 mt-2">Please wait while we verify your account</p>
      </div>
    </div>
  );
}