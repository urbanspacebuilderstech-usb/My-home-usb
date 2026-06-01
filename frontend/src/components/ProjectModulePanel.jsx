import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Eye, ShieldCheck, RefreshCw, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Super Admin → Settings → Project Management Module
 *
 * Renders every project-touching user with a "View / Edit" button that opens
 * a side dialog where Super Admin can toggle which Project Detail tabs are
 * visible for that user. Saving requires the Super Admin password.
 *
 * New users created by HR appear here automatically because the backend
 * pulls live from `db.users`.
 */
export default function ProjectModulePanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [editing, setEditing] = useState(null);   // {user, perms, mode:'view'|'edit'}
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/admin/project-module/users`);
      setUsers(r.data?.users || []);
      setTabs(r.data?.tabs || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load users');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const roles = useMemo(() => {
    const s = new Set(users.map(u => u.role).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      const matchesQ = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesQ && matchesRole;
    });
  }, [users, search, roleFilter]);

  const openDialog = (u, mode) => {
    setEditing({ user: u, perms: { ...(u.project_tab_permissions || {}) }, mode });
    setPassword('');
  };

  const togglePerm = (key) => {
    if (editing?.mode !== 'edit') return;
    setEditing(e => ({ ...e, perms: { ...e.perms, [key]: !e.perms[key] } }));
  };

  const save = async () => {
    if (!password.trim()) { toast.error('Super Admin password required'); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/admin/project-module/users/${editing.user.user_id}/permissions`, {
        password,
        permissions: editing.perms,
      });
      toast.success('Permissions saved');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const countOn = (perms) => Object.values(perms || {}).filter(Boolean).length;

  return (
    <Card data-testid="project-module-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-violet-600" /> Project Management Module
        </CardTitle>
        <CardDescription className="text-xs">
          Control which Project Detail tabs each user can access. Toggle ON to grant access, OFF to hide the tab entirely for that user. Saving requires the Super Admin password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm max-w-xs"
            data-testid="pm-search"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-sm rounded-md border px-3 py-2 bg-white dark:bg-gray-800"
            data-testid="pm-role-filter"
          >
            {roles.map(r => <option key={r} value={r}>{r === 'all' ? 'All Roles' : r.replace('_', ' ')}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={load} className="gap-1" data-testid="pm-refresh">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <div className="ml-auto text-xs text-gray-500 self-center">
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Users table */}
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users match.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Role / Designation</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Tabs Allowed</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(u => {
                  const on = countOn(u.project_tab_permissions);
                  return (
                    <tr key={u.user_id} className="hover:bg-gray-50/50" data-testid={`pm-row-${u.user_id}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium uppercase text-gray-700 bg-gray-100 rounded-full px-2.5 py-0.5">
                          {(u.display_role || u.role || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${on === tabs.length ? 'bg-emerald-100 text-emerald-700' : on === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {on} / {tabs.length}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openDialog(u, 'view')} className="h-8 px-2.5 gap-1" data-testid={`pm-view-${u.user_id}`}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <Button size="sm" onClick={() => openDialog(u, 'edit')} className="h-8 px-2.5 gap-1 bg-violet-600 hover:bg-violet-700" data-testid={`pm-edit-${u.user_id}`}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* View / Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing?.mode === 'edit'
                ? <><Pencil className="h-5 w-5 text-violet-600" /> Edit Tab Access</>
                : <><Eye className="h-5 w-5 text-gray-600" /> View Tab Access</>}
            </DialogTitle>
            <DialogDescription>
              {editing?.user?.name} · <span className="uppercase">{(editing?.user?.role || '').replace('_', ' ')}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            {tabs.map(t => {
              const on = !!editing?.perms?.[t.key];
              return (
                <div
                  key={t.key}
                  className={`flex items-center justify-between rounded-md border px-3 py-2.5 transition ${
                    on ? 'bg-emerald-50/40 border-emerald-200' : 'bg-gray-50 border-gray-200'
                  }`}
                  data-testid={`pm-tab-row-${t.key}`}
                >
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{on ? 'Visible' : 'Hidden from this user'}</p>
                  </div>
                  <Switch
                    checked={on}
                    disabled={editing?.mode !== 'edit'}
                    onCheckedChange={() => togglePerm(t.key)}
                    data-testid={`pm-toggle-${t.key}`}
                  />
                </div>
              );
            })}
          </div>

          {editing?.mode === 'edit' && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label htmlFor="pm-pw" className="text-xs">Super Admin Password *</Label>
              <Input
                id="pm-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password to confirm"
                className="text-sm"
                data-testid="pm-pw"
                autoComplete="current-password"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving} className="gap-1">
              <X className="h-3.5 w-3.5" /> {editing?.mode === 'edit' ? 'Cancel' : 'Close'}
            </Button>
            {editing?.mode === 'edit' && (
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={save} disabled={saving} data-testid="pm-save">
                {saving ? 'Saving…' : 'Save with Password'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
