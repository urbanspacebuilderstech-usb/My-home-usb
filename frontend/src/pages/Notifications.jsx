import { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/notifications`)
      ]);
      setUser(userRes.data);
      setNotifications(notifsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const markAsRead = async (notifId) => {
    try {
      await axios.patch(`${API}/notifications/${notifId}/read`);
      fetchData();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <h1 data-testid="notifications-title" className="text-3xl font-bold mb-8">Notifications</h1>

        <div className="space-y-4">
          {notifications.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No notifications</Card>
          ) : (
            notifications.map((notif) => (
              <Card
                key={notif.notification_id}
                data-testid={`notif-${notif.notification_id}`}
                className={`p-6 cursor-pointer ${notif.read ? 'opacity-60' : ''}`}
                onClick={() => !notif.read && markAsRead(notif.notification_id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold">{notif.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{notif.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">{new Date(notif.created_at).toLocaleString()}</p>
                  </div>
                  {!notif.read && <Badge>New</Badge>}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}