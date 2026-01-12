import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, DollarSign, TrendingUp, TrendingDown, Bell, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Sidebar from '@/components/Sidebar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchUser();
    fetchDashboardData();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`);
      const userData = userRes.data;
      setUser(userData);

      if (userData.role === 'super_admin') {
        const response = await axios.get(`${API}/dashboards/super-admin`);
        setDashboardData(response.data);
      }

      const projectsRes = await axios.get(`${API}/projects`);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      
      <div className="flex-1 md:ml-64">
        <div className="bg-white border-b border-border p-4 flex items-center justify-between md:hidden">
          <h1 className="text-lg font-bold">ConstructionOS</h1>
          <Button
            data-testid="mobile-menu-btn"
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        <div className="p-4 md:p-8">
          <div className="mb-8">
            <h1 data-testid="dashboard-title" className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Welcome back, {user.name} <Badge className="ml-2">{user.role.replace('_', ' ').toUpperCase()}</Badge>
            </p>
          </div>

          {user.role === 'super_admin' && dashboardData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card data-testid="total-projects-card" className="border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-bold">{dashboardData.total_projects}</div>
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="total-value-card" className="border-l-4 border-l-secondary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Project Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-bold">₹{(dashboardData.total_project_value / 100000).toFixed(1)}L</div>
                    <DollarSign className="h-8 w-8 text-secondary" />
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="total-received-card" className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Received</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-bold">₹{(dashboardData.total_received / 100000).toFixed(1)}L</div>
                    <TrendingUp className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="balance-card" className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-bold">₹{(dashboardData.balance / 100000).toFixed(1)}L</div>
                    <TrendingDown className="h-8 w-8 text-amber-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card data-testid="recent-projects-card">
            <CardHeader>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your active construction projects</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No projects found</p>
              ) : (
                <div className="space-y-4">
                  {projects.slice(0, 5).map((project) => (
                    <div
                      key={project.project_id}
                      data-testid={`project-item-${project.project_id}`}
                      className="flex items-center justify-between p-4 border border-border rounded-sm hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/projects/${project.project_id}`}
                    >
                      <div className="flex-1">
                        <h3 className="font-semibold">{project.name}</h3>
                        <p className="text-sm text-muted-foreground">{project.client_name} • {project.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">₹{(project.total_value / 100000).toFixed(1)}L</p>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
