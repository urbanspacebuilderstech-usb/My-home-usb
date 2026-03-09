import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Settings, Plus, Edit, Trash2, Save, X, GripVertical, ArrowLeft,
  ChevronUp, ChevronDown, Flag, RefreshCw, Users, ArrowDownRight
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLOR_OPTIONS = [
  '#6366f1', '#3b82f6', '#8b5cf6', '#10b981', '#22c55e',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316',
  '#64748b', '#0ea5e9', '#a855f7', '#84cc16', '#e11d48'
];

export default function StageManagement() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('type') || 'pre_sales';
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingStage, setEditingStage] = useState(null);
  const [addDialog, setAddDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newStage, setNewStage] = useState({ name: '', color: '#6366f1', is_final: false });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, stagesRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/stages/with-counts`),
      ]);
      setUser(userRes.data);
      setStages(stagesRes.data);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
      else if (error.response?.status === 403) {
        toast.error('Access denied - Super Admin only');
        window.location.href = '/dashboard';
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredStages = stages
    .filter(s => s.stage_type === activeTab && s.is_active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleAddStage = async () => {
    if (!newStage.name.trim()) { toast.error('Stage name is required'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/crm/stages`, {
        name: newStage.name.trim(),
        stage_type: activeTab,
        color: newStage.color,
      });
      if (newStage.is_final) {
        const stagesRes = await axios.get(`${API}/crm/stages/with-counts`);
        const created = stagesRes.data.find(s => s.name === newStage.name.trim() && s.stage_type === activeTab);
        if (created) {
          await axios.patch(`${API}/crm/stages/${created.stage_id}`, { is_final: true });
        }
      }
      toast.success('Stage created');
      setAddDialog(false);
      setNewStage({ name: '', color: '#6366f1', is_final: false });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create stage');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStage = async (stageId) => {
    if (!editingStage?.name?.trim()) { toast.error('Stage name is required'); return; }
    setSaving(true);
    try {
      await axios.patch(`${API}/crm/stages/${stageId}`, {
        name: editingStage.name.trim(),
        color: editingStage.color,
        is_final: editingStage.is_final,
        order: editingStage.order,
      });
      toast.success('Stage updated');
      setEditingStage(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update stage');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStage = async (stageId) => {
    setSaving(true);
    try {
      await axios.delete(`${API}/crm/stages/${stageId}`);
      toast.success('Stage deleted');
      setDeleteDialog(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete stage');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStage = async (stage, direction) => {
    const currentIdx = filteredStages.findIndex(s => s.stage_id === stage.stage_id);
    const swapIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (swapIdx < 0 || swapIdx >= filteredStages.length) return;

    const swapStage = filteredStages[swapIdx];
    try {
      await Promise.all([
        axios.patch(`${API}/crm/stages/${stage.stage_id}`, { order: swapStage.order }),
        axios.patch(`${API}/crm/stages/${swapStage.stage_id}`, { order: stage.order }),
      ]);
      fetchData();
    } catch {
      toast.error('Failed to reorder');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} />
        <div className="flex items-center justify-center h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </div>
    );
  }

  const preSalesCount = stages.filter(s => s.stage_type === 'pre_sales' && s.is_active !== false).length;
  const salesCount = stages.filter(s => s.stage_type === 'sales' && s.is_active !== false).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-4" data-testid="stage-management">
      <AppHeader user={user} />

      <div className="max-w-5xl mx-auto px-3 md:px-6 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => window.location.href = '/settings'} data-testid="back-to-settings">
            <ArrowLeft className="h-4 w-4" /> Settings
          </Button>
          <div className="flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900" data-testid="stage-mgmt-title">Pipeline Stage Management</h2>
            <p className="text-xs sm:text-sm text-gray-500">Add, edit, reorder, and delete stages for Pre-Sales & Sales pipelines</p>
          </div>
          <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700" onClick={() => setAddDialog(true)} data-testid="add-stage-btn">
            <Plus className="h-4 w-4" /> Add Stage
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-indigo-500" onClick={() => setActiveTab('pre_sales')}>
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-gray-500">Pre-Sales Stages</p>
              <p className="text-2xl font-bold text-indigo-700">{preSalesCount}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500" onClick={() => setActiveTab('sales')}>
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-gray-500">Sales Stages</p>
              <p className="text-2xl font-bold text-green-700">{salesCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2 mb-4" data-testid="stage-type-tabs">
            <TabsTrigger value="pre_sales" className="gap-1.5 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800">
              <ArrowDownRight className="h-4 w-4" /> Pre-Sales ({preSalesCount})
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-800">
              <Users className="h-4 w-4" /> Sales ({salesCount})
            </TabsTrigger>
          </TabsList>

          {['pre_sales', 'sales'].map(tabType => (
            <TabsContent key={tabType} value={tabType}>
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-gray-700">
                    {tabType === 'pre_sales' ? 'Pre-Sales' : 'Sales'} Pipeline Stages
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm" data-testid={`stages-table-${tabType}`}>
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-center px-2 py-2 font-medium text-gray-500 w-16">Order</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Color</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Stage Name</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-500">Leads</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-500">Final</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-500">Move</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStages.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No stages configured</td></tr>
                        ) : filteredStages.map((stage, idx) => {
                          const isEditing = editingStage?.stage_id === stage.stage_id;
                          return (
                            <tr key={stage.stage_id} className="border-b hover:bg-gray-50" data-testid={`stage-row-${stage.stage_id}`}>
                              <td className="px-2 py-2 text-center">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                                  {stage.order || idx + 1}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <div className="flex gap-1 flex-wrap">
                                    {COLOR_OPTIONS.slice(0, 8).map(c => (
                                      <button key={c} className={`w-5 h-5 rounded-full border-2 ${editingStage.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }} onClick={() => setEditingStage({ ...editingStage, color: c })} />
                                    ))}
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: stage.color }} />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <Input className="h-7 text-sm" value={editingStage.name}
                                    onChange={e => setEditingStage({ ...editingStage, name: e.target.value })}
                                    data-testid={`edit-stage-name-${stage.stage_id}`} />
                                ) : (
                                  <span className="font-medium" style={{ color: stage.color }}>{stage.name}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge variant="outline" className="text-xs">{stage.lead_count || 0}</Badge>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isEditing ? (
                                  <Switch checked={editingStage.is_final} onCheckedChange={v => setEditingStage({ ...editingStage, is_final: v })} />
                                ) : stage.is_final ? (
                                  <Flag className="h-4 w-4 text-green-600 mx-auto" />
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0}
                                    onClick={() => handleMoveStage(stage, 'up')} data-testid={`move-up-${stage.stage_id}`}>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === filteredStages.length - 1}
                                    onClick={() => handleMoveStage(stage, 'down')} data-testid={`move-down-${stage.stage_id}`}>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isEditing ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Button size="sm" className="h-6 text-[10px] bg-green-600 hover:bg-green-700 px-2" disabled={saving}
                                      onClick={() => handleUpdateStage(stage.stage_id)} data-testid={`save-stage-${stage.stage_id}`}>
                                      <Save className="h-3 w-3 mr-0.5" /> Save
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingStage(null)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1">
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-blue-600"
                                      onClick={() => setEditingStage({ ...stage })} data-testid={`edit-stage-${stage.stage_id}`}>
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
                                      onClick={() => setDeleteDialog(stage)} data-testid={`delete-stage-${stage.stage_id}`}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Add Stage Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add New Stage</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Pipeline</Label>
              <Badge className={activeTab === 'pre_sales' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}>
                {activeTab === 'pre_sales' ? 'Pre-Sales' : 'Sales'}
              </Badge>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Stage Name *</Label>
              <Input value={newStage.name} onChange={e => setNewStage({ ...newStage, name: e.target.value })}
                placeholder="e.g. Site Visit, Negotiation..." data-testid="new-stage-name" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map(c => (
                  <button key={c} className={`w-7 h-7 rounded-full border-2 transition-transform ${newStage.color === c ? 'border-gray-800 scale-110' : 'border-gray-200'}`}
                    style={{ backgroundColor: c }} onClick={() => setNewStage({ ...newStage, color: c })} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={newStage.is_final} onCheckedChange={v => setNewStage({ ...newStage, is_final: v })} data-testid="new-stage-final" />
              <Label className="text-sm">Final stage (triggers pipeline completion)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleAddStage} disabled={saving} data-testid="confirm-add-stage">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} Add Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Stage</DialogTitle></DialogHeader>
          {deleteDialog && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete <strong style={{ color: deleteDialog.color }}>{deleteDialog.name}</strong>?
              </p>
              {(deleteDialog.lead_count || 0) > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  This stage has <strong>{deleteDialog.lead_count}</strong> leads. Move them to another stage before deleting.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteStage(deleteDialog.stage_id)}
              disabled={saving || (deleteDialog?.lead_count || 0) > 0} data-testid="confirm-delete-stage">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
