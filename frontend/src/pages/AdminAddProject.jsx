// Super Admin / Planning / Sales — Quick Create Project Wizard (4-step)
// Step 1: Pre-Sales · Step 2: Sales · Step 3: Project basics · Step 4: Confirm & Create
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Check, FolderPlus, User, Building2, Briefcase, CheckCircle2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const STEPS = [
  { id: 1, label: 'Pre-Sales', icon: User, desc: 'Lead / Contact details' },
  { id: 2, label: 'Sales', icon: Briefcase, desc: 'Project scope & value' },
  { id: 3, label: 'Project', icon: Building2, desc: 'Stages & timeline' },
  { id: 4, label: 'Confirm', icon: CheckCircle2, desc: 'Review & create' },
];

export default function AdminAddProject() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState([]);

  const [form, setForm] = useState({
    // Pre-Sales
    name: '',
    email: '',
    phone: '',
    alternative_phone: '',
    source: 'walk_in',
    city: '',
    state: '',
    pincode: '',
    address: '',
    notes: '',
    budget: '',
    sqft: '',
    requirements: '',
    // Sales
    project_name: '',
    location: '',
    project_sqft: '',
    building_type: 'residential',
    total_value: '',
    expected_handover_months: 12,
    advance_amount: '',
    advance_payment_mode: 'cash',
    advance_payment_reference: '',
    // Project
    stage_template_name: '',
  });

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Auth + access guard
  useEffect(() => {
    (async () => {
      try {
        const me = await axios.get(`${API}/auth/me`);
        const role = me.data?.role;
        if (!['super_admin', 'planning', 'sales'].includes(role)) {
          toast.error('You do not have permission to access this page');
          navigate('/dashboard');
          return;
        }
        setUser(me.data);
      } catch {
        navigate('/login');
      }
    })();
  }, [navigate]);

  // Fetch stage templates
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/stage-templates`);
        setTemplates(Array.isArray(res.data) ? res.data : []);
      } catch { setTemplates([]); }
    })();
  }, []);

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return form.project_name.trim().length > 0;
    if (step === 3) return true;
    return true;
  };

  const handleNext = () => {
    if (!canNext()) {
      if (step === 1) toast.error('Lead name is required');
      else if (step === 2) toast.error('Project name is required');
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.project_name.trim()) {
      toast.error('Lead name and Project name are required'); return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        alternative_phone: form.alternative_phone || null,
        source: form.source,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        address: form.address,
        notes: form.notes,
        custom_fields: {
          budget: form.budget,
          sqft: form.sqft,
          requirement: form.requirements,
        },
        project_name: form.project_name.trim(),
        location: form.location || form.city,
        sqft: Number(form.project_sqft) || Number(form.sqft) || 0,
        building_type: form.building_type,
        total_value: Number(form.total_value) || 0,
        expected_handover_months: Number(form.expected_handover_months) || 12,
        advance_amount: Number(form.advance_amount) || 0,
        advance_payment_mode: form.advance_payment_mode,
        advance_payment_reference: form.advance_payment_reference || null,
        stage_template_name: form.stage_template_name || null,
      };
      const res = await axios.post(`${API}/admin/quick-create-project`, payload);
      toast.success(`Project '${form.project_name}' created (${res.data?.stages_created || 0} stages seeded)`);
      navigate(`/projects/${res.data.project_id}`);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d) => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join(' · ')
        : (typeof detail === 'string' ? detail : 'Failed to create project');
      toast.error(msg);
    }
    setSubmitting(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="admin-add-project-page">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1" data-testid="back-btn">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><FolderPlus className="h-5 w-5 text-indigo-600" /> Add Project</h1>
              <p className="text-xs text-gray-500">Quick-create a project end-to-end (Lead → Sales → Project)</p>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-6 grid grid-cols-4 gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div
                key={s.id}
                className={`rounded-xl border px-3 py-2.5 ${isActive ? 'border-indigo-500 bg-indigo-50' : isDone ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}
                data-testid={`step-${s.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isActive ? 'bg-indigo-600 text-white' : isDone ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${isActive ? 'text-indigo-700' : isDone ? 'text-emerald-700' : 'text-gray-600'}`}>{s.label}</p>
                    <p className="text-[10px] text-gray-500 truncate">{s.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step {step} of 4 — {STEPS[step - 1].label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <Step1 form={form} update={update} />
            )}
            {step === 2 && (
              <Step2 form={form} update={update} />
            )}
            {step === 3 && (
              <Step3 form={form} update={update} templates={templates} />
            )}
            {step === 4 && (
              <Step4 form={form} templates={templates} />
            )}
          </CardContent>
        </Card>

        {/* Footer nav */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" size="sm" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))} data-testid="prev-btn">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 4 ? (
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleNext} data-testid="next-btn">
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={submitting} data-testid="create-project-btn">
              {submitting ? 'Creating...' : (<><Check className="h-4 w-4 mr-1" /> Create Project</>)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Step 1: Pre-Sales ----------
function Step1({ form, update }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Full Name <span className="text-red-500">*</span></Label>
          <Input value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="Client name" data-testid="pre-name" />
        </div>
        <div>
          <Label className="text-xs">Source</Label>
          <Select value={form.source} onValueChange={(v) => update({ source: v })}>
            <SelectTrigger data-testid="pre-source"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="walk_in">Walk-in</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="seo">SEO</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} placeholder="client@example.com" data-testid="pre-email" />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input value={form.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+91 9876543210" data-testid="pre-phone" />
        </div>
        <div>
          <Label className="text-xs">Alternative Phone</Label>
          <Input value={form.alternative_phone} onChange={(e) => update({ alternative_phone: e.target.value })} data-testid="pre-alt-phone" />
        </div>
        <div>
          <Label className="text-xs">Budget Range</Label>
          <Select value={form.budget} onValueChange={(v) => update({ budget: v })}>
            <SelectTrigger data-testid="pre-budget"><SelectValue placeholder="Select budget..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Under 50L">Under 50L</SelectItem>
              <SelectItem value="50L - 1Cr">50L – 1Cr</SelectItem>
              <SelectItem value="1Cr - 2Cr">1Cr – 2Cr</SelectItem>
              <SelectItem value="2Cr - 5Cr">2Cr – 5Cr</SelectItem>
              <SelectItem value="Above 5Cr">Above 5Cr</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Square Feet (approx)</Label>
          <Input value={form.sqft} onChange={(e) => update({ sqft: e.target.value })} placeholder="e.g. 1200 or 30 x 40" data-testid="pre-sqft" />
        </div>
        <div>
          <Label className="text-xs">City</Label>
          <Input value={form.city} onChange={(e) => update({ city: e.target.value })} data-testid="pre-city" />
        </div>
        <div>
          <Label className="text-xs">State</Label>
          <Input value={form.state} onChange={(e) => update({ state: e.target.value })} data-testid="pre-state" />
        </div>
        <div>
          <Label className="text-xs">Pincode</Label>
          <Input value={form.pincode} onChange={(e) => update({ pincode: e.target.value })} data-testid="pre-pincode" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Address</Label>
          <Input value={form.address} onChange={(e) => update({ address: e.target.value })} data-testid="pre-address" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Requirements</Label>
          <Textarea rows={3} value={form.requirements} onChange={(e) => update({ requirements: e.target.value })} placeholder="Client's requirements, preferences, scope summary..." data-testid="pre-requirements" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Internal Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Notes visible only internally" data-testid="pre-notes" />
        </div>
      </div>
    </>
  );
}

// ---------- Step 2: Sales ----------
function Step2({ form, update }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <Label className="text-xs">Project Name <span className="text-red-500">*</span></Label>
        <Input value={form.project_name} onChange={(e) => update({ project_name: e.target.value })} placeholder="e.g. Mr. Vivekanthan G+2 Residence" data-testid="sales-project-name" />
      </div>
      <div>
        <Label className="text-xs">Location</Label>
        <Input value={form.location} onChange={(e) => update({ location: e.target.value })} placeholder="City / area" data-testid="sales-location" />
      </div>
      <div>
        <Label className="text-xs">Plot / Built-up Area (sqft)</Label>
        <Input type="number" min="0" value={form.project_sqft} onChange={(e) => update({ project_sqft: e.target.value })} placeholder="e.g. 1800" data-testid="sales-sqft" />
      </div>
      <div>
        <Label className="text-xs">Building Type</Label>
        <Select value={form.building_type} onValueChange={(v) => update({ building_type: v })}>
          <SelectTrigger data-testid="sales-building-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="villa">Villa</SelectItem>
            <SelectItem value="apartment">Apartment</SelectItem>
            <SelectItem value="office">Office</SelectItem>
            <SelectItem value="industrial">Industrial</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Expected Handover (months)</Label>
        <Input type="number" min="1" value={form.expected_handover_months} onChange={(e) => update({ expected_handover_months: e.target.value })} data-testid="sales-handover-months" />
      </div>
      <div>
        <Label className="text-xs">Total Project Value (₹)</Label>
        <Input type="number" min="0" value={form.total_value} onChange={(e) => update({ total_value: e.target.value })} placeholder="e.g. 8000000" data-testid="sales-total-value" />
      </div>
      <div>
        <Label className="text-xs">Advance Collected (₹)</Label>
        <Input type="number" min="0" value={form.advance_amount} onChange={(e) => update({ advance_amount: e.target.value })} placeholder="0 if none" data-testid="sales-advance-amount" />
      </div>
      <div>
        <Label className="text-xs">Advance Payment Mode</Label>
        <Select value={form.advance_payment_mode} onValueChange={(v) => update({ advance_payment_mode: v })}>
          <SelectTrigger data-testid="sales-payment-mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="savings_account">HDFC SAVINGS</SelectItem>
            <SelectItem value="current_account">HDFC CURRENT</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
            <SelectItem value="escrow">Escrow</SelectItem>
            <SelectItem value="neft">NEFT / RTGS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Payment Reference / Cheque No (optional)</Label>
        <Input value={form.advance_payment_reference} onChange={(e) => update({ advance_payment_reference: e.target.value })} data-testid="sales-payment-ref" />
      </div>
    </div>
  );
}

// ---------- Step 3: Project / Stages ----------
function Step3({ form, update, templates }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Stages Template <span className="text-red-500">*</span></Label>
        <Select value={form.stage_template_name} onValueChange={(v) => update({ stage_template_name: v })}>
          <SelectTrigger data-testid="proj-stage-template"><SelectValue placeholder={templates.length ? 'Pick a stage template (e.g. G+1 8-month)' : 'No templates available'} /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.template_id || t.template_name} value={t.template_name}>
                {t.template_name} ({(t.stages || []).length} stages)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-gray-500 mt-1">
          When picked, the project will be seeded with these stages automatically. Planning can edit afterwards.
        </p>
      </div>

      {form.stage_template_name && (
        <div className="rounded-xl border bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Stages preview</p>
          <div className="flex flex-wrap gap-1.5">
            {((templates.find((t) => t.template_name === form.stage_template_name)?.stages) || []).slice(0, 30).map((s, i) => (
              <span key={i} className={`text-[10px] px-2 py-0.5 rounded border ${s.is_section_header ? 'bg-slate-200 border-slate-300 font-semibold' : 'bg-white border-gray-200 text-gray-700'}`}>
                {s.sl_no ? `${s.sl_no} ` : ''}{s.stage_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Step 4: Confirm ----------
function Step4({ form, templates }) {
  const tpl = templates.find((t) => t.template_name === form.stage_template_name);
  const Row = ({ k, v }) => (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-xs">
      <span className="text-gray-500">{k}</span>
      <span className="font-medium text-gray-900 text-right break-words">{v || '—'}</span>
    </div>
  );
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-indigo-700 uppercase mb-1.5">Pre-Sales</p>
        <Row k="Name" v={form.name} />
        <Row k="Phone" v={form.phone} />
        <Row k="Email" v={form.email} />
        <Row k="City / State" v={`${form.city || '—'}${form.state ? ', ' + form.state : ''}`} />
        <Row k="Budget" v={form.budget} />
        <Row k="Requirements" v={form.requirements} />
      </div>
      <div>
        <p className="text-xs font-semibold text-indigo-700 uppercase mb-1.5">Sales</p>
        <Row k="Project Name" v={form.project_name} />
        <Row k="Location" v={form.location} />
        <Row k="Built-up sqft" v={form.project_sqft} />
        <Row k="Building Type" v={form.building_type} />
        <Row k="Total Value" v={fmt(Number(form.total_value) || 0)} />
        <Row k="Advance" v={`${fmt(Number(form.advance_amount) || 0)} (${form.advance_payment_mode})`} />
        <Row k="Expected Handover" v={`${form.expected_handover_months} months`} />
      </div>
      <div>
        <p className="text-xs font-semibold text-indigo-700 uppercase mb-1.5">Project / Stages</p>
        <Row k="Stage Template" v={form.stage_template_name || 'None (Planning will add later)'} />
        <Row k="Stages to be seeded" v={tpl ? `${(tpl.stages || []).length} stages` : '—'} />
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
        On clicking <span className="font-semibold">Create Project</span>, the system will: (1) create a Lead in Pre-Sales with stage <span className="font-mono">Booked</span>, (2) create the Project, (3) record advance income, (4) seed stages from the chosen template.
      </div>
    </div>
  );
}
