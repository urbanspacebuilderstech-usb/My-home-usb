import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [userRes, projRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects/${projectId}`)
      ]);
      setUser(userRes.data);
      setProject(projRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  if (!user || !project) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <div className="mb-8">
          <h1 data-testid="project-detail-title" className="text-3xl font-bold mb-2">{project.name}</h1>
          <p className="text-muted-foreground">{project.client_name} • {project.location}</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Total Value</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{(project.total_value / 100000).toFixed(2)}L</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
            <CardContent><Badge>{project.status}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Start Date</CardTitle></CardHeader>
            <CardContent><p className="text-lg">{new Date(project.start_date).toLocaleDateString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Completion</CardTitle></CardHeader>
            <CardContent><p className="text-lg">{new Date(project.expected_completion).toLocaleDateString()}</p></CardContent>
          </Card>
        </div>

        <div className="mt-8 space-x-4">
          <Button data-testid="view-boq-btn" onClick={() => window.location.href = `/boq/${projectId}`}>View BOQ</Button>
          <Button data-testid="view-expenses-btn" variant="outline" onClick={() => window.location.href = `/expenses?project=${projectId}`}>View Expenses</Button>
        </div>
      </div>
    </div>
  );
}