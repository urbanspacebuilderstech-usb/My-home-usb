import React, { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Upload, Loader2, X, Link2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * ImageUpload — reusable image picker used across User App & Packages admin.
 * - Two input modes: file upload (primary) OR paste URL (fallback).
 * - Shows an inline thumbnail preview.
 * - value / onChange keep the parent form in full control.
 *
 * Props:
 *   value      : current image URL (string)
 *   onChange   : (url) => void
 *   label      : field label (default "Image")
 *   testId     : data-testid root
 *   maxHint    : caption under the input (e.g. "1080×1080 recommended")
 */
export default function ImageUpload({ value, onChange, label = 'Image', testId = 'image-upload', maxHint }) {
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('upload'); // 'upload' | 'url'
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (max 5MB)');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post(`${API}/uploads/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(r.data.url);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clear = () => onChange('');

  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-0.5 rounded bg-gray-100 p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-2 py-0.5 rounded ${mode === 'upload' ? 'bg-white shadow-sm font-semibold text-emerald-700' : 'text-gray-500'}`}
            data-testid={`${testId}-mode-upload`}
          >
            <Upload className="inline h-2.5 w-2.5 mr-0.5" /> Upload
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`px-2 py-0.5 rounded ${mode === 'url' ? 'bg-white shadow-sm font-semibold text-emerald-700' : 'text-gray-500'}`}
            data-testid={`${testId}-mode-url`}
          >
            <Link2 className="inline h-2.5 w-2.5 mr-0.5" /> URL
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div className="mt-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
            data-testid={`${testId}-file-input`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full justify-center gap-1.5 border-dashed"
            data-testid={`${testId}-file-btn`}
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="h-3.5 w-3.5" /> {value ? 'Replace image' : 'Choose file (JPG/PNG/WEBP, ≤5MB)'}</>
            )}
          </Button>
        </div>
      ) : (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="mt-1"
          data-testid={`${testId}-url-input`}
        />
      )}

      {maxHint && <p className="text-[10px] text-amber-600 mt-0.5">{maxHint}</p>}

      {value && (
        <div className="mt-2 relative inline-block">
          <img
            src={value}
            alt="preview"
            className="h-28 w-28 object-cover rounded border"
            data-testid={`${testId}-preview`}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <button
            type="button"
            onClick={clear}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow hover:bg-red-600"
            data-testid={`${testId}-clear`}
            title="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
