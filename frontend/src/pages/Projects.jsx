import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, MapPin, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Sidebar from '@/components/Sidebar';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Projects() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    fetchProjects();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
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

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canCreate = user.role === 'super_admin' || user.role === 'project_manager';

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      
      <div className="flex-1 md:ml-64">
        <div className="p-4 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 data-testid="projects-title" className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                Projects
              </h1>
              <p className="text-muted-foreground">Manage construction projects</p>
            </div>
            {canCreate && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="create-project-btn" className="gap-2">
                    <Plus className="h-4 w-4" />
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
                        <Label htmlFor="name">Project Name *</Label>
                        <Input
                          id="name"
                          data-testid="project-name-input"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="client_name">Client Name *</Label>
                        <Input
                          id="client_name"
                          data-testid="client-name-input"
                          value={formData.client_name}
                          onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="location">Location *</Label>
                        <Input
                          id="location"
                          data-testid="location-input"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="total_value">Total Value (₹) *</Label>
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
                        <Label htmlFor="start_date">Start Date *</Label>
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
                        <Label htmlFor="expected_completion">Expected Completion *</Label>
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
                        <Label htmlFor="status">Status *</Label>
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
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button data-testid="submit-project-btn" type="submit">Create Project</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {projects.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No projects found</p>
                </CardContent>
              </Card>
            ) : (
              projects.map((project) => (
                <Card
                  key={project.project_id}
                  data-testid={`project-card-${project.project_id}`}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => window.location.href = `/projects/${project.project_id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{project.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{project.client_name}</p>
                      </div>
                      <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {project.location}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(project.start_date).toLocaleDateString()} - {new Date(project.expected_completion).toLocaleDateString()}
                      </div>
                      <div className="pt-3 border-t border-border">
                        <p className="text-2xl font-bold text-primary">₹{(project.total_value / 100000).toFixed(2)}L</p>
                        <p className="text-xs text-muted-foreground">Total Project Value</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
