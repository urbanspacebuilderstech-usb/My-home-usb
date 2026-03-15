import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      const [userRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/notifications`)
      ]);
      setUser(userRes.data);
      setNotifications(notifsRes.data);

      // If super admin, also fetch pending approvals
      if (userRes.data.role === 'super_admin') {
        try {
          const pendingRes = await axios.get(`${API}/admin/pending-approvals`);
          setPendingApprovals(pendingRes.data);
        } catch (e) {
          console.log('Admin endpoint not available');
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };
  useAutoRefresh(fetchData, 15000);

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const handleMarkRead = async (notificationId) => {
    try {
      await axios.patch(`${API}/notifications/${notificationId}/read`);
      toast.success('Marked as read');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to update notification');
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 data-testid="notifications-title" className="text-3xl font-bold text-gray-900">Notifications</h2>
          <p className="text-gray-600 mt-1">Stay updated on project activities</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Bell className="h-6 w-6 text-amber-600" />
                <span className="text-2xl font-bold text-amber-700">{notifications.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unread</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700">{unreadCount}</div>
            </CardContent>
          </Card>
          {user.role === 'super_admin' && pendingApprovals && (
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Pending Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700">{pendingApprovals.count}</div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Super Admin Quick Actions */}
        {user.role === 'super_admin' && pendingApprovals && pendingApprovals.count > 0 && (
          <Card className="mb-8 border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-800">Action Required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-yellow-700 mb-4">
                You have {pendingApprovals.count} work order(s) pending approval.
              </p>
              <Button
                data-testid="go-to-approvals-btn"
                onClick={() => window.location.href = '/approvals'}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Review Approvals
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Notifications List */}
        <Card>
          <CardHeader>
            <CardTitle>All Notifications</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map((notif) => (
                  <div
                    key={notif.notification_id}
                    data-testid={`notif-${notif.notification_id}`}
                    className={`p-4 flex items-start gap-4 hover:bg-gray-50 ${!notif.read ? 'bg-amber-50' : ''}`}
                  >
                    <div className={`p-2 rounded-full ${!notif.read ? 'bg-amber-50' : 'bg-gray-100'}`}>
                      <Bell className={`h-5 w-5 ${!notif.read ? 'text-amber-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{notif.title}</h4>
                          <p className="text-gray-600 mt-1">{notif.message}</p>
                        </div>
                        {!notif.read && (
                          <Badge variant="default" className="bg-secondary">New</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="text-sm text-gray-400">
                          {new Date(notif.created_at).toLocaleString()}
                        </span>
                        {notif.link && (
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto text-amber-600"
                            onClick={() => window.location.href = notif.link}
                          >
                            View Details
                          </Button>
                        )}
                        {!notif.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() => handleMarkRead(notif.notification_id)}
                          >
                            <Check className="h-4 w-4" />
                            Mark as read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
