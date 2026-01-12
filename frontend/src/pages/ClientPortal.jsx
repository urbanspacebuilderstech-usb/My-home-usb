import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Upload, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientPortal() {
  const { projectId } = useParams();
  const [data, setData] = useState(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoCategory, setPhotoCategory] = useState('progress');
  const [docFile, setDocFile] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('plans');

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

  const handlePhotoUpload = async (e) => {
    e.preventDefault();
    if (!photoFile) return;

    const formData = new FormData();
    formData.append('file', photoFile);
    formData.append('project_id', projectId);
    formData.append('caption', photoCaption);
    formData.append('category', photoCategory);

    try {
      await axios.post(`${API}/site-photos/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Photo uploaded successfully');
      setPhotoDialogOpen(false);
      setPhotoFile(null);
      setPhotoCaption('');
      fetchData();
    } catch (error) {
      toast.error('Failed to upload photo');
    }
  };

  const handleDocumentUpload = async (e) => {
    e.preventDefault();
    if (!docFile) return;

    const formData = new FormData();
    formData.append('file', docFile);
    formData.append('project_id', projectId);
    formData.append('title', docTitle);
    formData.append('category', docCategory);

    try {
      await axios.post(`${API}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Document uploaded successfully');
      setDocDialogOpen(false);
      setDocFile(null);
      setDocTitle('');
      fetchData();
    } catch (error) {
      toast.error('Failed to upload document');
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
                  <Badge variant={stage.status === 'completed' ? 'default' : stage.status === 'in_progress' ? 'secondary' : 'outline'}>
                    {stage.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Site Photos</CardTitle>
            <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="upload-photo-btn" size="sm" className="gap-2">
                  <Upload className="h-4 w-4" />Upload Photo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Upload Site Photo</DialogTitle></DialogHeader>
                <form onSubmit={handlePhotoUpload} className="space-y-4">
                  <div>
                    <Label>Photo</Label>
                    <Input
                      data-testid="photo-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPhotoFile(e.target.files[0])}
                      required
                    />
                  </div>
                  <div>
                    <Label>Caption</Label>
                    <Input
                      data-testid="photo-caption-input"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="Optional caption"
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={photoCategory} onValueChange={setPhotoCategory}>
                      <SelectTrigger data-testid="photo-category-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="progress">Progress</SelectItem>
                        <SelectItem value="milestone">Milestone</SelectItem>
                        <SelectItem value="issue">Issue</SelectItem>
                        <SelectItem value="completion">Completion</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button data-testid="submit-photo-btn" type="submit">Upload Photo</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {data.photos.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No photos uploaded yet</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {data.photos.map((photo) => (
                  <div key={photo.photo_id} data-testid={`photo-${photo.photo_id}`} className="relative group">
                    <img
                      src={`${API}/files/${photo.file_id}`}
                      alt={photo.caption || 'Site photo'}
                      className="w-full h-48 object-cover rounded border"
                    />
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2 rounded-b">
                        {photo.caption}
                      </div>
                    )}
                    <Badge className="absolute top-2 right-2">{photo.category}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Project Documents</CardTitle>
            <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="upload-doc-btn" size="sm" variant="outline" className="gap-2">
                  <FileText className="h-4 w-4" />Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
                <form onSubmit={handleDocumentUpload} className="space-y-4">
                  <div>
                    <Label>Document</Label>
                    <Input
                      data-testid="doc-file-input"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg"
                      onChange={(e) => setDocFile(e.target.files[0])}
                      required
                    />
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input
                      data-testid="doc-title-input"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Document title"
                      required
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={docCategory} onValueChange={setDocCategory}>
                      <SelectTrigger data-testid="doc-category-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plans">Site Plans</SelectItem>
                        <SelectItem value="drawings">Drawings</SelectItem>
                        <SelectItem value="permits">Permits</SelectItem>
                        <SelectItem value="contracts">Contracts</SelectItem>
                        <SelectItem value="invoices">Invoices</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button data-testid="submit-doc-btn" type="submit">Upload Document</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {data.documents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No documents uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {data.documents.map((doc) => (
                  <div
                    key={doc.document_id}
                    data-testid={`doc-${doc.document_id}`}
                    className="flex items-center justify-between p-4 border rounded hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{doc.category}</p>
                      </div>
                    </div>
                    <Button
                      data-testid={`download-doc-${doc.document_id}`}
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`${API}/files/${doc.file_id}`, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
