import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, Loader2, X } from 'lucide-react';
import { FileList } from './FileUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Project Documents > Finalis Drawing — every upload is asked for a Drawing
// Name and Drawing Number first; both are stored on the file's `description`
// ("Name · No. Number") so they show alongside the image/PDF everywhere the
// generic FileList renders it (view/download/delete all reuse that as-is).
export function FinalDrawingsSection({ projectId, files, canManage, onRefresh }) {
  const [formOpen, setFormOpen] = useState(false);
  const [drawingName, setDrawingName] = useState('');
  const [drawingNumber, setDrawingNumber] = useState('');
  const [uploading, setUploading] = useState(false);

  const resetForm = () => {
    setFormOpen(false);
    setDrawingName('');
    setDrawingNumber('');
  };

  const handleFileChosen = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File exceeds 10MB limit'); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
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
        {!formOpen ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFormOpen(true)} data-testid="final-drawing-add-btn">
            <Upload className="h-3.5 w-3.5" /> Upload Drawing
          </Button>
        ) : (
          <div className="w-full border rounded-lg p-3 bg-gray-50 space-y-2.5" data-testid="final-drawing-form">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">New Drawing</p>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600" data-testid="final-drawing-form-close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
            </div>
            <div>
              <input
                type="file"
                id="final-drawing-file-input"
                className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                onChange={(e) => handleFileChosen(e.target.files?.[0])}
                data-testid="final-drawing-file-input"
              />
              <Button
                size="sm"
                className="gap-1.5 bg-amber-600 hover:bg-amber-700"
                disabled={!drawingName.trim() || !drawingNumber.trim() || uploading}
                onClick={() => document.getElementById('final-drawing-file-input').click()}
                data-testid="final-drawing-choose-file-btn"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploading ? 'Uploading...' : 'Choose Image / PDF'}
              </Button>
              {(!drawingName.trim() || !drawingNumber.trim()) && (
                <p className="text-[11px] text-gray-400 mt-1">Enter both fields to enable the file picker.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <FileList files={files} onDelete={onRefresh} canDelete={canManage} />
    </div>
  );
}
