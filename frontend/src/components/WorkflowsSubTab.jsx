import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { toast } from 'sonner';
import {
  Hammer,
  Lock,
  SendHorizontal,
  CheckCircle2,
  Loader2,
  Workflow as WorkflowIcon,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Workflows sub-tab inside Workflow Master Setup.
 *
 * Right now hosts the **Work Order Stage Flow** picker — a two-mode toggle
 * that decides who initiates the "open stage" action:
 *
 *   • se_request   → SE clicks Request, PM + Planning approve, then it opens
 *                    (button enabled for Site Engineer).
 *   • planning_open → Planning unlocks the stage directly (current default;
 *                     SE works on it once it's open). The Request button is
 *                     hidden from the Site Engineer in this mode.
 *
 * The mode is persisted via `/api/settings/workflow` and consumed by the
 * Site Engineer Work Order popup (`SiteEngineerWorkOrdersV2`) to gate the
 * Request affordance.
 */
export default function WorkflowsSubTab() {
  const [mode, setMode] = useState('planning_open');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Password gate — clicking a flow card opens this dialog. The PATCH only
  // fires after the user re-enters their password (verified server-side).
  const [pwdGate, setPwdGate] = useState({ open: false, target: null });
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/settings/workflow`);
        if (r.data?.wo_stage_flow) setMode(r.data.wo_stage_flow);
      } catch {
        // No setting yet — default to planning_open
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Click handler on a flow card — instead of saving immediately, open the
  // password confirmation dialog. Skips when the card is already active.
  const requestChange = (target) => {
    if (target === mode) return;
    setPassword('');
    setShowPwd(false);
    setPwdGate({ open: true, target });
  };

  const confirmAndSave = async () => {
    if (!password.trim()) { toast.error('Enter your password to confirm'); return; }
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/workflow`, {
        wo_stage_flow: pwdGate.target,
        password: password,
      });
      setMode(pwdGate.target);
      toast.success(`Work Order Stage Flow set to ${pwdGate.target === 'se_request' ? 'Site Engineer Requests' : 'Planning Opens Directly'}`);
      setPwdGate({ open: false, target: null });
      setPassword('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500" data-testid="workflows-loading">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading workflow settings…
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="workflows-subtab">
      <div className="flex items-start gap-2">
        <WorkflowIcon className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-base font-bold text-gray-900">Work Order Stage Flow</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose how a stage moves from <span className="font-semibold">Locked</span> to <span className="font-semibold">Open</span> on every Work Order — the Site Engineer-driven request flow, or the Planning-driven direct-open flow.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FlowCard
          active={mode === 'se_request'}
          disabled={saving}
          onClick={() => requestChange('se_request')}
          icon={<SendHorizontal className="h-5 w-5 text-amber-700" />}
          tone="amber"
          title="Site Engineer Requests"
          subtitle="SE → PM → Planning"
          description="Site Engineer clicks Request on a locked stage. PM and Planning approve (or reject); on approval the stage opens automatically and the SE can record DLR & request payment."
          steps={['SE: Request', 'PM: Approve / Reject', 'Planning: Approve / Reject', 'Stage opens → SE works']}
          testId="flow-card-se-request"
        />
        <FlowCard
          active={mode === 'planning_open'}
          disabled={saving}
          onClick={() => requestChange('planning_open')}
          icon={<Hammer className="h-5 w-5 text-emerald-700" />}
          tone="emerald"
          title="Planning Opens Directly"
          subtitle="Planning → SE works"
          description="Planning manager unlocks a stage directly from the dashboard. The Site Engineer then sees the stage as Open and proceeds with work, DLR and payment requests."
          steps={['Planning: Unlock', 'Stage opens', 'SE: Work + DLR', 'SE: Request payment']}
          testId="flow-card-planning-open"
        />
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3" data-testid="workflows-current">
        <p className="text-[10px] uppercase tracking-wider text-indigo-700 font-semibold">Currently Active</p>
        <p className="text-sm font-bold text-gray-900 mt-0.5">
          {mode === 'se_request' ? 'Site Engineer Requests Stage Open' : 'Planning Opens Stage Directly'}
        </p>
        <p className="text-[11px] text-gray-600 mt-1">
          {mode === 'se_request'
            ? 'Site Engineer dashboards show a Request button on every locked stage. PM + Planning receive the request and can Approve or Reject from their queues.'
            : 'Site Engineer dashboards hide the Request button on locked stages — they must wait for Planning to unlock.'}
        </p>
      </div>

      {/* Password confirmation gate. Mirrors the HR Reset Password UX —
          eye toggle for visibility, Enter submits, cancel resets. Backend
          re-verifies the password before persisting the flow change. */}
      <Dialog open={pwdGate.open} onOpenChange={(v) => { if (!v) { setPwdGate({ open: false, target: null }); setPassword(''); } }}>
        <DialogContent className="max-w-sm" data-testid="workflow-pwd-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              Confirm Workflow Change
            </DialogTitle>
            <DialogDescription className="text-xs">
              You are switching the Work Order Stage Flow to{' '}
              <strong className="text-indigo-700">
                {pwdGate.target === 'se_request' ? 'Site Engineer Requests' : 'Planning Opens Directly'}
              </strong>. Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs font-semibold">Your Password</Label>
            <div className="relative">
              <Input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmAndSave(); }}
                placeholder="Enter your account password"
                className="pr-10 mt-1"
                autoFocus
                disabled={saving}
                data-testid="workflow-pwd-input"
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                data-testid="workflow-pwd-toggle"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Verified against your logged-in account. Never stored locally.</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPwdGate({ open: false, target: null }); setPassword(''); }}
              disabled={saving}
              data-testid="workflow-pwd-cancel"
            >Cancel</Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={confirmAndSave}
              disabled={saving || !password.trim()}
              data-testid="workflow-pwd-confirm"
            >
              {saving ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>) : 'Confirm & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowCard({ active, disabled, onClick, icon, tone, title, subtitle, description, steps, testId }) {
  // Static class strings keep Tailwind JIT happy.
  const palette = tone === 'amber'
    ? { wrap: active ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-200 bg-white hover:border-amber-300', badge: 'bg-amber-100 text-amber-800 border-amber-200', step: 'text-amber-700' }
    : { wrap: active ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-gray-200 bg-white hover:border-emerald-300', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', step: 'text-emerald-700' };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-xl border-2 p-4 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${palette.wrap}`}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="text-sm font-bold text-gray-900">{title}</p>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">{subtitle}</p>
          </div>
        </div>
        {active ? (
          <Badge className={`border ${palette.badge} text-[10px] flex items-center gap-1`}>
            <CheckCircle2 className="h-3 w-3" /> Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Inactive
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-gray-600 mb-2 leading-relaxed">{description}</p>
      <ol className={`text-[10px] ${palette.step} font-medium space-y-0.5`}>
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-white border border-current text-[8px] flex items-center justify-center font-bold">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </button>
  );
}
