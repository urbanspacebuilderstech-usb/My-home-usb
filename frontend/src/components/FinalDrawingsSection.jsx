import { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Upload, Loader2, FileText } from 'lucide-react';
import { FileList } from './FileUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Project Documents > Finalis Drawing — "Upload Drawing" opens a popup asking
// for a Drawing Name and Drawing Number plus the file. Both are stored on the
// file's `description` ("Name · No. Number") so they show alongside the
// image/PDF everywhere the generic FileList renders it (view/download/delete
// all reuse that as-is).
export function FinalDrawingsSection({ projectId, files, canManage, onRefresh }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawingName, setDrawingName] = useState('');
  const [drawingNumber, setDrawingNumber] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setDialogOpen(false);
    setDrawingName('');
    setDrawingNumber('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!drawingName.trim() || !drawingNumber.trim()) { toast.error('Enter both Drawing Name and Number'); return; }
    if (!selectedFile) { toast.error('Choose a file to upload'); return; }
    if (selectedFile.size > 10 * 1024 * 1024) { toast.error('File exceeds 10MB limit'); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('category', 'final_drawing');
    formData.append('description', `${drawingName.trim()} · No. ${drawingNumber.trim()}`);
    if (projectId) formData.append('project_id', projectId);
    try {
      await axios.post(`${API}/files/upload`, formData, { withCredentials: true });
      toast.success('Drawing uploaded');
      resetForm();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div data-testid="final-drawings-section">
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)} data-testid="final-drawing-add-btn">
          <Upload className="h-3.5 w-3.5" /> Upload Drawing
        </Button>
      </div>
      <FileList files={files} onDelete={onRefresh} canDelete={canManage} />

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && !uploading && resetForm()}>
        <DialogContent className="max-w-md" data-testid="final-drawing-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Upload className="h-5 w-5" /> Upload Drawing
            </DialogTitle>
            <DialogDescription className="text-xs">Enter the drawing's name and number, then choose the file.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Drawing Name *</Label>
              <Input
                value={drawingName}
                onChange={(e) => setDrawingName(e.target.value)}
                placeholder="e.g. Ground Floor Plan"
                className="mt-1 h-9 text-sm"
                data-testid="final-drawing-name-input"
              />
            </div>
            <div>
              <Label className="text-xs">Drawing Number *</Label>
              <Input
                value={drawingNumber}
                onChange={(e) => setDrawingNumber(e.target.value)}
                placeholder="e.g. DRW-05"
                className="mt-1 h-9 text-sm"
                data-testid="final-drawing-number-input"
              />
            </div>
            <div>
              <Label className="text-xs">File *</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                data-testid="final-drawing-file-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 w-full flex items-center gap-2 border border-dashed rounded-md px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
                data-testid="final-drawing-choose-file-btn"
              >
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate text-gray-700">{selectedFile ? selectedFile.name : 'Choose Image / PDF'}</span>
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={resetForm} disabled={uploading}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={handleUpload} disabled={uploading} data-testid="final-drawing-submit">
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
