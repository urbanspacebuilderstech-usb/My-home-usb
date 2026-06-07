import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import WorkflowsSubTab from './WorkflowsSubTab';
import { Pencil, GripVertical, ArrowUp, ArrowDown, ShieldCheck, RefreshCw, X, Workflow, Cog, Users as UsersIcon } from 'lucide-react';
import ProjectModulePanel from './ProjectModulePanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Super Admin → Settings → Workflow Master Setup
 *
 * 3 sub-tabs:
 *   • Users    — list every role (designation). Click Edit → popup with
 *                reorderable + toggle-able menu list. Saving requires the
 *                Super Admin password.
 *   • Workflows — coming soon placeholder.
 *   • Functions — coming soon placeholder.
 */
export default function WorkflowMasterPanel() {
  const [subTab, setSubTab] = useState('users');
  return (
    <Card data-testid="workflow-master-panel">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Workflow className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold">Workflow Master Setup</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Control which menus each role sees and in what order. Toggles ON show the tab; OFF hides it completely. Drag/reorder controls the menu order on each role's dashboard.
        </p>

        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-1.5" data-testid="wf-users-tab">
              <UsersIcon className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="workflows" className="gap-1.5" data-testid="wf-flows-tab">
              <Workflow className="h-3.5 w-3.5" /> Workflows
            </TabsTrigger>
            <TabsTrigger value="functions" className="gap-1.5" data-testid="wf-fn-tab">
              <Cog className="h-3.5 w-3.5" /> Functions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-0">
            <UsersSubTab />
          </TabsContent>

          <TabsContent value="workflows" className="mt-0">
            <WorkflowsSubTab />
          </TabsContent>

          <TabsContent value="functions" className="mt-0">
            <ProjectModulePanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ComingSoon({ title }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-12 text-center bg-gray-50/50">
      <p className="text-base font-medium text-gray-500">{title}</p>
      <p className="text-xs text-gray-400 mt-1">Coming Soon</p>
    </div>
  );
}

function UsersSubTab() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);  // {role, menus}
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/admin/workflow-master/roles`);
      setRoles(r.data?.roles || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEdit = (role) => {
    setEditing({ ...role, menus: role.menus.map(m => ({ ...m })) });
    setPassword('');
  };

  const togglePerm = (idx) => {
    setEditing(e => {
      const next = e.menus.map((m, i) => i === idx ? { ...m, enabled: !m.enabled } : m);
      return { ...e, menus: next };
    });
  };

  // Drag-and-drop reorder with native HTML5 DnD (no extra lib).
  const [dragIdx, setDragIdx] = useState(null);
  const onDragStart = (i) => setDragIdx(i);
  const onDragOver = (i, e) => { e.preventDefault(); };
  const onDrop = (i) => {
    if (dragIdx === null || dragIdx === i) return;
    setEditing(e => {
      const arr = [...e.menus];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(i, 0, moved);
      return { ...e, menus: arr };
    });
    setDragIdx(null);
  };

  const moveUp = (i) => {
    if (i === 0) return;
    setEditing(e => {
      const arr = [...e.menus];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      return { ...e, menus: arr };
    });
  };
  const moveDown = (i) => {
    setEditing(e => {
      if (i === e.menus.length - 1) return e;
      const arr = [...e.menus];
      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      return { ...e, menus: arr };
    });
  };

  const save = async () => {
    if (!password.trim()) { toast.error('Super Admin password required'); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/admin/workflow-master/roles/${editing.role}`, {
        password,
        menus: editing.menus.map(m => ({ key: m.key, enabled: m.enabled })),
      });
      toast.success('Workflow saved');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>;

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={load} className="gap-1" data-testid="wf-refresh">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Visible Menus</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {roles.map(r => {
              const visible = r.menus.filter(m => m.enabled).length;
              return (
                <tr key={r.role} className="hover:bg-gray-50/50" data-testid={`wf-row-${r.role}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-[10px] uppercase text-gray-400">{r.role.replace('_', ' ')}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${visible === r.menus.length ? 'bg-emerald-100 text-emerald-700' : visible === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {visible} / {r.menus.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button size="sm" onClick={() => openEdit(r)} className="h-8 px-3 gap-1 bg-indigo-600 hover:bg-indigo-700" data-testid={`wf-edit-${r.role}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="wf-edit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-indigo-600" /> {editing?.label}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Drag menus to reorder, toggle to show/hide. Hidden menus won't appear in this role's dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            {editing?.menus.map((m, i) => (
              <div
                key={m.key}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(i, e)}
                onDrop={() => onDrop(i)}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-2 transition cursor-grab ${
                  m.enabled ? 'bg-emerald-50/40 border-emerald-200' : 'bg-gray-50 border-gray-200'
                }`}
                data-testid={`wf-menu-row-${m.key}`}
              >
                <GripVertical className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{m.enabled ? 'Visible to this role' : 'Hidden'}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveUp(i)} disabled={i === 0} data-testid={`wf-up-${m.key}`}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveDown(i)} disabled={i === editing.menus.length - 1} data-testid={`wf-down-${m.key}`}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Switch
                  checked={m.enabled}
                  onCheckedChange={() => togglePerm(i)}
                  data-testid={`wf-toggle-${m.key}`}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t">
            <Label htmlFor="wf-pw" className="text-xs flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-indigo-600" /> Super Admin Password *
            </Label>
            <Input
              id="wf-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password to confirm"
              className="text-sm"
              data-testid="wf-pw"
              autoComplete="current-password"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving} className="gap-1">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={save} disabled={saving} data-testid="wf-save">
              {saving ? 'Saving…' : 'Save with Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
