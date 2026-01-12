import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientPortal() {
  const { projectId } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const response = await axios.get(`${API}/client-portal/project/${projectId}`);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  if (!data) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 data-testid="client-portal-title" className="text-3xl font-bold mb-2">{data.project.name}</h1>
          <p className="text-muted-foreground">{data.project.location}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader><CardTitle className="text-sm">Project Value</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{(data.project.total_value / 100000).toFixed(2)}L</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Total Paid</CardTitle></CardHeader>
            <CardContent><p data-testid="total-paid" className="text-2xl font-bold text-green-500">₹{(data.total_paid / 100000).toFixed(2)}L</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Balance</CardTitle></CardHeader>
            <CardContent><p data-testid="balance" className="text-2xl font-bold text-amber-500">₹{(data.balance / 100000).toFixed(2)}L</p></CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader><CardTitle>Construction Stages</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.stages.map((stage) => (
                <div key={stage.stage_id} data-testid={`stage-${stage.stage_id}`} className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">{stage.name}</span>
                  <Badge>{stage.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Site Photos</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Site photos will appear here</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}