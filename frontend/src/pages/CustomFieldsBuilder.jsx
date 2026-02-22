import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { 
  Settings, LogOut, Plus, Trash2, Edit2, GripVertical, Save, ArrowLeft,
  Type, Hash, List, CheckSquare, MapPin, Calendar, Mail, Phone, Link2,
  AlignLeft, ToggleLeft, RefreshCw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: Type, description: 'Single line text input' },
  { value: 'number', label: 'Number', icon: Hash, description: 'Numeric input' },
  { value: 'dropdown', label: 'Dropdown', icon: List, description: 'Single selection from options' },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare, description: 'Yes/No toggle' },
  { value: 'multi_select', label: 'Multi-Select', icon: List, description: 'Multiple selections' },
  { value: 'address', label: 'Address', icon: MapPin, description: 'Full address input' },
  { value: 'location', label: 'GPS Location', icon: MapPin, description: 'Latitude/Longitude' },
  { value: 'date', label: 'Date', icon: Calendar, description: 'Date picker' },
  { value: 'email', label: 'Email', icon: Mail, description: 'Email address' },
  { value: 'phone', label: 'Phone', icon: Phone, description: 'Phone number' },
  { value: 'textarea', label: 'Long Text', icon: AlignLeft, description: 'Multi-line text' },
  { value: 'url', label: 'URL', icon: Link2, description: 'Website link' }
];

export default function CustomFieldsBuilder() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState([]);
  
  // Dialogs
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [selectedField, setSelectedField] = useState(null);
  
  // Form
  const [fieldForm, setFieldForm] = useState({
    name: '',
    label: '',
    field_type: 'text',
    required: false,
    options: [],
    placeholder: '',
    default_value: '',
    is_conditional: false,
    condition_field: '',
    condition_value: ''
  });
  
  const [newOption, setNewOption] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, fieldsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/custom-fields`)
      ]);
      
      setUser(userRes.data);
      setFields(fieldsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const resetForm = () => {
    setFieldForm({
      name: '',
      label: '',
      field_type: 'text',
      required: false,
      options: [],
      placeholder: '',
      default_value: '',
      is_conditional: false,
      condition_field: '',
      condition_value: ''
    });
    setNewOption('');
  };

  const openEditDialog = (field) => {
    setSelectedField(field);
    setFieldForm({
      name: field.name,
      label: field.label,
      field_type: field.field_type,
      required: field.required || false,
      options: field.options || [],
      placeholder: field.placeholder || '',
      default_value: field.default_value || '',
      is_conditional: field.is_conditional || false,
      condition_field: field.condition_field || '',
      condition_value: field.condition_value || ''
    });
    setEditDialog(true);
  };

  const handleCreate = async () => {
    if (!fieldForm.name || !fieldForm.label) {
      toast.error('Name and Label are required');
      return;
    }
    
    // Validate name format
    const nameRegex = /^[a-z][a-z0-9_]*$/;
    if (!nameRegex.test(fieldForm.name)) {
      toast.error('Name must start with lowercase letter and contain only lowercase letters, numbers, and underscores');
      return;
    }

    try {
      await axios.post(`${API}/crm/custom-fields`, fieldForm);
      toast.success('Custom field created');
      setCreateDialog(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create field');
    }
  };

  const handleUpdate = async () => {
    try {
      await axios.patch(`${API}/crm/custom-fields/${selectedField.field_id}`, fieldForm);
      toast.success('Custom field updated');
      setEditDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update field');
    }
  };

  const handleDelete = async (fieldId) => {
    if (!confirm('Are you sure you want to delete this field?')) return;
    
    try {
      await axios.delete(`${API}/crm/custom-fields/${fieldId}`);
      toast.success('Custom field deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete field');
    }
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    setFieldForm({
      ...fieldForm,
      options: [...fieldForm.options, newOption.trim()]
    });
    setNewOption('');
  };

  const removeOption = (index) => {
    setFieldForm({
      ...fieldForm,
      options: fieldForm.options.filter((_, i) => i !== index)
    });
  };

  const getFieldTypeIcon = (type) => {
    const fieldType = FIELD_TYPES.find(f => f.value === type);
    return fieldType?.icon || Type;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/crm-pre-sales'}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Custom Fields Builder</h1>
              <p className="text-xs text-gray-500">Configure lead data collection</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button onClick={() => { resetForm(); setCreateDialog(true); }} data-testid="add-field-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500 uppercase">{user?.role?.replace('_', ' ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
        {/* Field Types Reference */}
        <Card className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-indigo-700 mb-3">Available Field Types</p>
            <div className="flex flex-wrap gap-2">
              {FIELD_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <Badge key={type.value} variant="outline" className="bg-white py-1.5 px-3">
                    <Icon className="h-3 w-3 mr-1.5" />
                    {type.label}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Fields List */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-indigo-600" />
              Custom Fields ({fields.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {fields.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Settings className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No custom fields configured</p>
                  <p className="text-sm">Click "Add Field" to create your first custom field</p>
                </div>
              ) : (
                fields.map((field, index) => {
                  const Icon = getFieldTypeIcon(field.field_type);
                  return (
                    <div key={field.field_id} className="p-4 hover:bg-gray-50 flex items-center gap-4">
                      <div className="text-gray-400">
                        <GripVertical className="h-5 w-5" />
                      </div>
                      
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-indigo-600" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{field.label}</p>
                          {field.required && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                          {field.is_conditional && (
                            <Badge variant="outline" className="text-xs">Conditional</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          <code className="bg-gray-100 px-1 rounded text-xs">{field.name}</code>
                          <span className="mx-2">•</span>
                          {FIELD_TYPES.find(f => f.value === field.field_type)?.label || field.field_type}
                          {field.options?.length > 0 && (
                            <span className="mx-2">• {field.options.length} options</span>
                          )}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openEditDialog(field)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDelete(field.field_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Field Dialog */}
      <Dialog open={createDialog || editDialog} onOpenChange={(open) => {
        if (!open) {
          setCreateDialog(false);
          setEditDialog(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editDialog ? 'Edit' : 'Create'} Custom Field</DialogTitle>
            <DialogDescription>
              Configure the field properties for lead data collection
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Field Name */}
            <div>
              <Label>Field Name (System ID) *</Label>
              <Input
                value={fieldForm.name}
                onChange={(e) => setFieldForm({...fieldForm, name: e.target.value.toLowerCase().replace(/\s/g, '_')})}
                placeholder="e.g., budget_range"
                disabled={editDialog}
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, underscores only</p>
            </div>
            
            {/* Label */}
            <div>
              <Label>Display Label *</Label>
              <Input
                value={fieldForm.label}
                onChange={(e) => setFieldForm({...fieldForm, label: e.target.value})}
                placeholder="e.g., Budget Range"
              />
            </div>
            
            {/* Field Type */}
            <div>
              <Label>Field Type</Label>
              <Select value={fieldForm.field_type} onValueChange={(v) => setFieldForm({...fieldForm, field_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        <span>{type.label}</span>
                        <span className="text-xs text-gray-400">- {type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Options (for dropdown, multi_select) */}
            {['dropdown', 'multi_select'].includes(fieldForm.field_type) && (
              <div>
                <Label>Options</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option..."
                    onKeyPress={(e) => e.key === 'Enter' && addOption()}
                  />
                  <Button type="button" onClick={addOption}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {fieldForm.options.map((opt, idx) => (
                    <Badge key={idx} variant="secondary" className="py-1 px-2">
                      {opt}
                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        className="ml-2 hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Placeholder */}
            <div>
              <Label>Placeholder Text</Label>
              <Input
                value={fieldForm.placeholder}
                onChange={(e) => setFieldForm({...fieldForm, placeholder: e.target.value})}
                placeholder="e.g., Enter your budget..."
              />
            </div>
            
            {/* Required */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Required Field</Label>
                <p className="text-xs text-gray-500">Make this field mandatory</p>
              </div>
              <Switch
                checked={fieldForm.required}
                onCheckedChange={(checked) => setFieldForm({...fieldForm, required: checked})}
              />
            </div>
            
            {/* Conditional */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Conditional Visibility</Label>
                <p className="text-xs text-gray-500">Show only when another field has specific value</p>
              </div>
              <Switch
                checked={fieldForm.is_conditional}
                onCheckedChange={(checked) => setFieldForm({...fieldForm, is_conditional: checked})}
              />
            </div>
            
            {fieldForm.is_conditional && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                <div>
                  <Label className="text-xs">Show when field</Label>
                  <Select 
                    value={fieldForm.condition_field} 
                    onValueChange={(v) => setFieldForm({...fieldForm, condition_field: v})}
                  >
                    <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                    <SelectContent>
                      {fields.filter(f => f.field_id !== selectedField?.field_id).map(f => (
                        <SelectItem key={f.field_id} value={f.field_id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Has value</Label>
                  <Input
                    value={fieldForm.condition_value}
                    onChange={(e) => setFieldForm({...fieldForm, condition_value: e.target.value})}
                    placeholder="Value"
                  />
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateDialog(false);
              setEditDialog(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={editDialog ? handleUpdate : handleCreate}>
              <Save className="h-4 w-4 mr-1" />
              {editDialog ? 'Update' : 'Create'} Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
