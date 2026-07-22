import { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown, ImageIcon, Loader2, Download, Link as LinkIcon, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { FileUpload, FileList } from './FileUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT_CATEGORIES = [
  { key: 'bhoomi_pooja', label: 'Bhoomi Pooja' },
  { key: 'thalavasal_pooja', label: 'Thalavasal Pooja' },
  { key: 'roof_pooja', label: 'Roof Pooja' },
  { key: 'key_handover', label: 'Key Handover' },
  { key: 'booking', label: 'Booking' },
  { key: 'house_warming', label: 'House Warming' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'interior', label: 'Interior' },
  { key: 'site_photos', label: 'Site Photos' },
  { key: 'others', label: 'Others' },
];

const categoryValue = (key) => `process_image_${key}`;

function CategoryLinks({ projectId, category, canManage }) {
  const [links, setLinks] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchLinks = () => {
    axios.get(`${API}/process-image-links`, { params: { project_id: projectId, category }, withCredentials: true })
      .then(res => setLinks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLinks([]));
  };

  useEffect(() => { fetchLinks(); }, [projectId, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLink = async () => {
    if (!url.trim()) { toast.error('Enter a URL'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/process-image-links`, { project_id: projectId, category, url: url.trim(), label: label.trim() }, { withCredentials: true });
      setUrl('');
      setLabel('');
      setShowAdd(false);
      fetchLinks();
      toast.success('Link added');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add link');
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (linkId) => {
    try {
      await axios.delete(`${API}/process-image-links/${linkId}`, { withCredentials: true });
      setLinks(ls => ls.filter(l => l.link_id !== linkId));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove link');
    }
  };

  return (
    <div className="pt-2 mt-2 border-t border-dashed" data-testid="process-image-links">
      {links.length > 0 && (
        <div className="space-y-1 mb-2">
          {links.map(l => (
            <div key={l.link_id} className="flex items-center justify-between gap-2 text-xs bg-blue-50 border border-blue-100 rounded px-2 py-1.5">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-700 hover:underline truncate min-w-0">
                <LinkIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{l.label || l.url}</span>
              </a>
              {canManage && (
                <button type="button" onClick={() => removeLink(l.link_id)} className="text-gray-400 hover:text-red-600 shrink-0" title="Remove link" data-testid={`process-image-remove-link-${l.link_id}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {showAdd ? (
        <div className="flex flex-col sm:flex-row gap-1.5">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="flex-1 h-8 px-2 text-xs border rounded-md"
            data-testid="process-image-link-url-input"
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="h-8 px-2 text-xs border rounded-md sm:w-32"
            data-testid="process-image-link-label-input"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-8 text-xs" onClick={addLink} disabled={saving} data-testid="process-image-link-save">Save</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setShowAdd(false); setUrl(''); setLabel(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)} data-testid="process-image-add-link-btn">
          <LinkIcon className="h-3 w-3" /> Add Link
        </Button>
      )}
    </div>
  );
}

export function ProjectProcessImages({ projectId, files, canManage, onRefresh }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);

  useEffect(() => {
    axios.get(`${API}/process-image-categories`, { withCredentials: true })
      .then(res => {
        if (Array.isArray(res.data?.categories) && res.data.categories.length) {
          setCategories(res.data.categories);
        }
      })
      .catch(() => { /* keep defaults */ })
      .finally(() => setLoadingCategories(false));
  }, []);

  const persistOrder = async (next) => {
    setSavingOrder(true);
    try {
      await axios.put(`${API}/process-image-categories`, { categories: next }, { withCredentials: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save order');
      setCategories(categories); // revert on failure
    } finally {
      setSavingOrder(false);
    }
  };

  const moveCategory = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    persistOrder(next);
  };

  if (loadingCategories) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading sections...
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="process-image-sections">
      {categories.map((cat, index) => {
        const catFiles = files.filter(f => f.category === categoryValue(cat.key));
        const isOpen = expandedKey === cat.key;
        return (
          <div key={cat.key} className="border rounded-lg overflow-hidden" data-testid={`process-image-section-${cat.key}`}>
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
              <button
                type="button"
                onClick={() => setExpandedKey(isOpen ? null : cat.key)}
                className="flex items-center gap-2 flex-1 text-left min-w-0"
                data-testid={`process-image-toggle-${cat.key}`}
              >
                {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                <ImageIcon className="h-4 w-4 text-purple-600 shrink-0" />
                <span className="font-medium text-sm truncate">{cat.label}</span>
                <Badge variant="outline" className="text-xs">{catFiles.length}</Badge>
              </button>
              {canManage && (
                <div className="flex items-center gap-0.5 ml-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={index === 0 || savingOrder}
                    onClick={() => moveCategory(index, -1)}
                    title="Move up"
                    data-testid={`process-image-up-${cat.key}`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={index === categories.length - 1 || savingOrder}
                    onClick={() => moveCategory(index, 1)}
                    title="Move down"
                    data-testid={`process-image-down-${cat.key}`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="p-3 border-t">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  {catFiles.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => window.open(`${API}/files/download-zip?project_id=${projectId}&category=${categoryValue(cat.key)}`, '_blank')}
                      data-testid={`process-image-download-${cat.key}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  ) : <span />}
                  <FileUpload
                    projectId={projectId}
                    category={categoryValue(cat.key)}
                    onUploadComplete={onRefresh}
                    compact
                  />
                </div>
                <FileList
                  files={catFiles}
                  onDelete={onRefresh}
                  canDelete={canManage}
                />
                <CategoryLinks projectId={projectId} category={categoryValue(cat.key)} canManage={canManage} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
