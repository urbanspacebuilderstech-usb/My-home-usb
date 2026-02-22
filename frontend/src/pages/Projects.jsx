import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Building2, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Projects() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    client_name: '',
    location: '',
    total_value: '',
    start_date: '',
    expected_completion: '',
    status: 'planning'
  });

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      
      // Redirect Site Engineers to their dedicated board
      if (response.data.role === 'site_engineer') {
        window.location.href = '/site-engineer';
        return;
      }
      
      // Fetch projects only for non-site-engineers
      fetchProjects();
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${API}/projects`);
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      toast.error('Failed to load projects');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const projectData = {
        ...formData,
        total_value: parseFloat(formData.total_value),
        start_date: new Date(formData.start_date).toISOString(),
        expected_completion: new Date(formData.expected_completion).toISOString(),
        created_at: new Date().toISOString()
      };

      await axios.post(`${API}/projects`, projectData);
      toast.success('Project created successfully');
      setDialogOpen(false);
      fetchProjects();
      setFormData({
        name: '',
        client_name: '',
        location: '',
        total_value: '',
        start_date: '',
        expected_completion: '',
        status: 'planning'
      });
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
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

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canCreate = user.role === 'super_admin' || user.role === 'project_manager';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Project Management System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              data-testid="dashboard-btn"
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => window.location.href = '/dashboard'}
            >
              Dashboard
            </Button>
            <Button
              data-testid="projects-btn"
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex text-blue-600 font-semibold"
            >
              Projects
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button
                data-testid="logout-btn"
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-8">
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => window.location.href = '/dashboard'}
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <h2 data-testid="projects-title" className="text-xl sm:text-3xl font-bold text-gray-900">
                All Projects
              </h2>
            </div>
            <p className="text-sm sm:text-base text-gray-600 ml-10 sm:ml-12">Manage your construction projects</p>
          </div>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-project-btn" className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                  <DialogDescription>Add a new construction project</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Project Name</Label>
                      <Input
                        id="name"
                        data-testid="project-name-input"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="client_name">Client Name</Label>
                      <Input
                        id="client_name"
                        data-testid="client-name-input"
                        value={formData.client_name}
                        onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        data-testid="location-input"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="total_value">Total Value</Label>
                      <Input
                        id="total_value"
                        data-testid="total-value-input"
                        type="number"
                        value={formData.total_value}
                        onChange={(e) => setFormData({ ...formData, total_value: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="start_date">Start Date</Label>
                      <Input
                        id="start_date"
                        data-testid="start-date-input"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="expected_completion">Expected Completion</Label>
                      <Input
                        id="expected_completion"
                        data-testid="completion-date-input"
                        type="date"
                        value={formData.expected_completion}
                        onChange={(e) => setFormData({ ...formData, expected_completion: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger data-testid="status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button data-testid="submit-project-btn" type="submit" className="bg-blue-600 hover:bg-blue-700">
                      Create Project
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {/* Mobile Card View */}
            <div className="block sm:hidden divide-y divide-gray-200">
              {projects.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  <p className="font-semibold mb-2">No projects yet</p>
                  <p className="text-sm">Create your first project to get started</p>
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.project_id}
                    data-testid={`project-card-mobile-${project.project_id}`}
                    className="p-4 active:bg-gray-50 cursor-pointer"
                    onClick={() => window.location.href = `/projects/${project.project_id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{project.name}</p>
                        <p className="text-xs text-gray-500">{project.client_name}</p>
                      </div>
                      <Badge 
                        variant={project.status === 'active' ? 'default' : 'secondary'}
                        className="capitalize text-xs ml-2"
                      >
                        {project.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <p className="text-xs text-gray-500">Value</p>
                        <p className="text-sm font-semibold text-gray-900">₹{(project.total_value / 100000).toFixed(2)}L</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Received</p>
                        <p className="text-sm font-semibold text-green-600">₹{((project.total_received || 0) / 100000).toFixed(2)}L</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Balance</p>
                        <p className="text-sm font-semibold text-red-600">₹{((project.balance || project.total_value) / 100000).toFixed(2)}L</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Value</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Received</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Spent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <div className="text-gray-500">
                          <p className="text-lg font-semibold mb-2">No projects yet</p>
                          <p className="text-sm">Create your first project to get started</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    projects.map((project) => (
                      <tr
                        key={project.project_id}
                        data-testid={`project-row-${project.project_id}`}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => window.location.href = `/projects/${project.project_id}`}
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-semibold text-gray-900">{project.name}</div>
                            <div className="text-sm text-gray-500">{project.client_name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          ₹{(project.total_value / 100000).toFixed(2)}L
                        </td>
                        <td className="px-6 py-4 text-gray-700">₹0</td>
                        <td className="px-6 py-4 text-gray-700">₹0</td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          ₹{(project.total_value / 100000).toFixed(2)}L
                        </td>
                        <td className="px-6 py-4">
                          <Badge 
                            variant={project.status === 'active' ? 'default' : 'secondary'}
                            className="capitalize"
                          >
                            {project.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            data-testid={`view-project-${project.project_id}`}
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/projects/${project.project_id}`;
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
