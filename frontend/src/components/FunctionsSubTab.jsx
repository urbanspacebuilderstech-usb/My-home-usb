import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Pencil, ShieldCheck, X, FolderKanban, CalendarDays } from 'lucide-react';
import ProjectModulePanel from './ProjectModulePanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Super Admin → Workflow Master → Functions
 *
 * Lists the customisable function modules as rows. Each row's Edit button
 * opens a module-specific configuration popup. Currently:
 *   • Project Management Module — per-user Project Detail tab access
 *   • DLR Date Module — global Site Engineer DLR date policy
 */
export default function FunctionsSubTab() {
  const [openModule, setOpenModule] = useState(null); // 'project' | 'dlr_date' | null

  return (
    <div className="space-y-2" data-testid="functions-sub-tab">
      <FunctionRow
        icon={<FolderKanban className="h-5 w-5 text-violet-600" />}
        title="Project Management Module"
        description="Control which Project Detail tabs each user can access (Estimate, Payment Schedule, Materials, etc.)."
        testId="fn-row-project"
        onEdit={() => setOpenModule('project')}
      />
      <FunctionRow
        icon={<CalendarDays className="h-5 w-5 text-teal-600" />}
        title="DLR Date Module"
        description="Decide if Site Engineers can record DLR only for today, or pick any date with a mandatory remark."
        testId="fn-row-dlr-date"
        onEdit={() => setOpenModule('dlr_date')}
      />

      {/* Project Management Module — opens the existing user-list panel inside a popup */}
      <Dialog open={openModule === 'project'} onOpenChange={(o) => !o && setOpenModule(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0" data-testid="fn-project-dialog">
          <ProjectModulePanel />
        </DialogContent>
      </Dialog>

      {/* DLR Date Module — global radio popup with password gate */}
      <DlrDateModuleDialog open={openModule === 'dlr_date'} onClose={() => setOpenModule(null)} />
    </div>
  );
}

function FunctionRow({ icon, title, description, onEdit, testId }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border bg-white dark:bg-gray-900 px-4 py-3 hover:bg-gray-50/60 transition"
      data-testid={testId}
    >
      <div className="shrink-0 h-10 w-10 rounded-md bg-violet-50 dark:bg-gray-800 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <Button
        size="sm"
        onClick={onEdit}
        className="h-8 px-3 gap-1 bg-violet-600 hover:bg-violet-700"
        data-testid={`${testId}-edit`}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
    </div>
  );
}

function DlrDateModuleDialog({ open, onClose }) {
  const [mode, setMode] = useState('ontime');
  const [serverMode, setServerMode] = useState('ontime');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${API}/settings/dlr-date-mode`);
        const m = r.data?.mode === 'custom' ? 'custom' : 'ontime';
        setServerMode(m);
        setMode(m);
      } catch (e) {
        toast.error('Failed to load DLR date mode');
      } finally { setLoading(false); }
    })();
  }, [open]);

  const dirty = mode !== serverMode;

  const save = async () => {
    if (!password.trim()) { toast.error('Super Admin password required'); return; }
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/dlr-date-mode`, { mode, password });
      toast.success('DLR date mode saved');
      setServerMode(mode);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="fn-dlr-date-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-teal-600" /> DLR Date Module
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose how Site Engineers may date their Daily Labour Reports. Saving requires the Super Admin password.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            <ModeOption
              checked={mode === 'ontime'}
              onSelect={() => setMode('ontime')}
              title="On-time DLR"
              description="SE can record DLR only for today's date. Date picker is locked."
              testId="fn-dlr-mode-ontime"
            />
            <ModeOption
              checked={mode === 'custom'}
              onSelect={() => setMode('custom')}
              title="Custom DLR with Remarks"
              description="SE can pick any date but must enter a remark explaining the back-date. The remark is shown on the DLR card."
              testId="fn-dlr-mode-custom"
            />
          </div>
        )}

        <div className="space-y-1.5 pt-2 border-t">
          <Label htmlFor="fn-dlr-pw" className="text-xs flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-violet-600" /> Super Admin Password *
          </Label>
          <Input
            id="fn-dlr-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password to confirm"
            className="text-sm"
            data-testid="fn-dlr-pw"
            autoComplete="current-password"
            disabled={!dirty}
          />
          {!dirty && (
            <p className="text-[10px] text-gray-400">No changes to save.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="gap-1">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700"
            onClick={save}
            disabled={saving || !dirty}
            data-testid="fn-dlr-save"
          >
            {saving ? 'Saving…' : 'Save with Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({ checked, onSelect, title, description, testId }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition ${
        checked
          ? 'border-teal-500 bg-teal-50/40'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 ${
            checked ? 'border-teal-600 bg-teal-600 ring-2 ring-white ring-offset-2 ring-offset-teal-100' : 'border-gray-300 bg-white'
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}
