import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, LogOut, HardHat, MapPin, Package, Users, ChevronRight,
  Clock, Menu, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SiteEngineerDashboard() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/site-engineer/my-projects`)
      ]);
      setUser(userRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. Only Site Engineers can access this page.');
        window.location.href = '/dashboard';
      } else {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== 'site_engineer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <HardHat className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">This page is only accessible to Site Engineers.</p>
            <Button onClick={() => window.location.href = '/dashboard'} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-friendly Navigation */}
      <nav className="bg-gradient-to-r from-orange-600 to-orange-700 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-white/20 p-1.5 sm:p-2 rounded-lg">
              <HardHat className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white">Site Engineer</h1>
              <p className="text-xs text-orange-100 hidden sm:block">My Projects</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-orange-100">Site Engineer</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-orange-500 h-8 w-8 sm:h-10 sm:w-10">
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
        {/* Mobile user info */}
        <div className="sm:hidden mt-2 pt-2 border-t border-orange-400/50">
          <p className="text-sm text-white">{user.name}</p>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h2 data-testid="site-engineer-title" className="text-xl sm:text-3xl font-bold text-gray-900">My Projects</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Select a project to manage materials and labour</p>
        </div>

        {/* Stats - Stack on mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Assigned</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Building2 className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600" />
                <span className="text-lg sm:text-2xl font-bold text-orange-700">{projects.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="h-4 w-4 sm:h-6 sm:w-6 text-blue-600" />
                <span className="text-lg sm:text-2xl font-bold text-blue-700">
                  {projects.reduce((acc, p) => acc + (p.active_orders || 0), 0)}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active Sites</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <MapPin className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
                <span className="text-lg sm:text-2xl font-bold text-green-700">
                  {projects.filter(p => p.status === 'active').length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Project List */}
        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-8 sm:py-12 text-center">
              <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Projects Assigned</h3>
              <p className="text-sm text-gray-600">
                You haven't been assigned to any projects yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {projects.map((project) => (
              <Card 
                key={project.project_id} 
                data-testid={`project-card-${project.project_id}`}
                className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-orange-500 active:bg-gray-50"
                onClick={() => window.location.href = `/site-engineer/project/${project.project_id}`}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-base sm:text-xl font-bold text-gray-900 truncate">{project.name}</h3>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {project.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1 sm:gap-4 text-xs sm:text-sm">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate">{project.client_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate">{project.location}</span>
                        </div>
                      </div>
                      {project.active_orders > 0 && (
                        <div className="mt-2 sm:mt-3">
                          <div className="inline-flex items-center gap-1.5 bg-orange-100 px-2 py-1 rounded-lg">
                            <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
                            <span className="text-xs sm:text-sm font-medium text-orange-700">
                              {project.active_orders} Active Orders
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
