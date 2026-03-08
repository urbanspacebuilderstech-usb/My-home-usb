import { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, X, FileText, Image, File, Trash2, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FILE_ICONS = {
  'image/jpeg': Image, 'image/png': Image, 'image/gif': Image, 'image/webp': Image,
  'application/pdf': FileText, 'text/csv': FileText, 'text/plain': FileText,
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ projectId, category = 'general', onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      if (projectId) formData.append('project_id', projectId);

      try {
        await axios.post(`${API}/files/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          withCredentials: true,
        });
        successCount++;
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} file(s) uploaded`);
      onUploadComplete?.();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div
      data-testid="file-upload-zone"
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
        dragOver ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-gray-400'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        onChange={(e) => handleUpload(e.target.files)}
        data-testid="file-upload-input"
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
          <p className="text-sm text-gray-500">Uploading...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-gray-400" />
          <p className="text-sm text-gray-600 font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-gray-400">Max 10MB per file. Images, PDFs, Documents</p>
        </div>
      )}
    </div>
  );
}

export function FileList({ files, onDelete, canDelete = true }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (fileId) => {
    setDeleting(fileId);
    try {
      await axios.delete(`${API}/files/${fileId}`, { withCredentials: true });
      toast.success('File deleted');
      onDelete?.();
    } catch {
      toast.error('Failed to delete file');
    }
    setDeleting(null);
  };

  const handleDownload = (file) => {
    window.open(`${API}/files/${file.file_id}/download`, '_blank');
  };

  if (!files?.length) {
    return (
      <div data-testid="file-list-empty" className="text-center py-8 text-gray-400 text-sm">
        No files uploaded yet
      </div>
    );
  }

  return (
    <div data-testid="file-list" className="space-y-2">
      {files.map((file) => {
        const IconComponent = FILE_ICONS[file.content_type] || File;
        const isImage = file.content_type?.startsWith('image/');

        return (
          <div
            key={file.file_id}
            data-testid={`file-item-${file.file_id}`}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`p-2 rounded-lg ${isImage ? 'bg-purple-100' : 'bg-amber-50'}`}>
                <IconComponent className={`h-4 w-4 ${isImage ? 'text-purple-600' : 'text-amber-600'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.original_filename || file.filename}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{formatSize(file.size)}</span>
                  <span>by {file.uploaded_by_name}</span>
                  {file.category && <Badge variant="outline" className="text-xs py-0">{file.category}</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                data-testid={`download-file-${file.file_id}`}
              >
                <Download className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  onClick={(e) => { e.stopPropagation(); handleDelete(file.file_id); }}
                  disabled={deleting === file.file_id}
                  data-testid={`delete-file-${file.file_id}`}
                >
                  {deleting === file.file_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
