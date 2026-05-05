import { AppHeader } from '../components/AppHeader';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LiveMap() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    axios.get(`${API}/auth/me`).then(res => setUser(res.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="live-map-page">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Live Map</h1>
        </div>
        <div className="bg-white rounded-lg border p-12 text-center">
          <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Live Map feature coming soon</p>
          <p className="text-gray-400 text-sm mt-2">Track project site locations and progress in real-time</p>
        </div>
      </div>
    </div>
  );
}
