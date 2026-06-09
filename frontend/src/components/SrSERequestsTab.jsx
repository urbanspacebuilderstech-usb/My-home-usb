// Sr. Site Engineer — Read-only Requests view (Feb 2026).
//
// 3 sub-tabs: Material / Labour Payments (RAB releases) / Petty Cash
// View-only — no Approve / Reject / Assign / Edit actions.
// Scoped to projects assigned to this Sr. SE (backend already applies role
// filter on /material-requests and /accountant/labour-payments). Petty cash
// uses the PM/Planning read endpoint which is also project-scoped.
//
// Heavy filter + pipeline cards from Planning Board are intentionally NOT
// reproduced here to keep the senior SE's view clean and quick. They can
// filter by sub-tab + use the search box.
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Package, Hammer, Wallet, Loader2, Search } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

const STATUS_PILL = {
  pending_planning_initial: { bg: 'bg-amber-100 text-amber-800', label: 'Pending Initial Review' },
  pending_procurement:      { bg: 'bg-orange-100 text-orange-700', label: 'Awaiting Procurement' },
  pending_accounts_approval:{ bg: 'bg-cyan-100 text-cyan-700', label: 'Awaiting Accountant' },
  pending_planning_final:   { bg: 'bg-indigo-100 text-indigo-700', label: 'Final Approval' },
  approved_for_po:          { bg: 'bg-emerald-100 text-emerald-700', label: 'Approved for PO' },
  po_issued:                { bg: 'bg-blue-100 text-blue-700', label: 'PO Issued' },
  in_transit:               { bg: 'bg-sky-100 text-sky-800', label: 'In Transit' },
  received:                 { bg: 'bg-green-100 text-green-800', label: 'Received' },
  pending:                  { bg: 'bg-gray-100 text-gray-700', label: 'Pending' },
  planning_approved:        { bg: 'bg-amber-100 text-amber-800', label: 'Ready for Release' },
  released:                 { bg: 'bg-green-100 text-green-800', label: 'Released' },
  issued:                   { bg: 'bg-emerald-100 text-emerald-800', label: 'Issued' },
  partially_spent:          { bg: 'bg-blue-100 text-blue-800', label: 'Partially Spent' },
  closed:                   { bg: 'bg-gray-200 text-gray-700', label: 'Closed' },
};

function StatusPill({ status }) {
  const meta = STATUS_PILL[status] || { bg: 'bg-gray-100 text-gray-700', label: (status || '—').replaceAll('_', ' ') };
  return <Badge className={`${meta.bg} text-[10px] font-medium capitalize`} data-testid={`status-pill-${status}`}>{meta.label}</Badge>;
}

export default function SrSERequestsTab() {
  const [activeSub, setActiveSub] = useState('material');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ material: [], labour: [], petty: [] });
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [mat, lab, pet] = await Promise.allSettled([
      axios.get(`${API}/material-requests?_=${Date.now()}`),
      axios.get(`${API}/accountant/labour-payments?_=${Date.now()}`),
      axios.get(`${API}/planning/petty-cash-requests?_=${Date.now()}`),
    ]);
    setData({
      material: mat.status === 'fulfilled' ? (mat.value.data?.requests || mat.value.data || []) : [],
      labour:   lab.status === 'fulfilled' ? (lab.value.data?.requests || lab.value.data || []) : [],
      petty:    pet.status === 'fulfilled' ? (pet.value.data?.requests || pet.value.data || []) : [],
    });
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = data[activeSub === 'material' ? 'material' : activeSub === 'labour_payments' ? 'labour' : 'petty'] || [];
    if (!q) return arr;
    return arr.filter((r) => {
      const blob = JSON.stringify(r).toLowerCase();
      return blob.includes(q);
    });
  }, [data, activeSub, search]);

  const subTabs = [
    { id: 'material', label: 'Material', icon: Package, count: data.material.length, color: 'amber' },
    { id: 'labour_payments', label: 'Labour Payments', icon: Hammer, count: data.labour.length, color: 'blue' },
    { id: 'petty_cash', label: 'Petty Cash', icon: Wallet, count: data.petty.length, color: 'emerald' },
  ];

  return (
    <div className="space-y-3" data-testid="sr-se-requests-tab">
      {/* Sub-pills */}
      <div className="grid grid-cols-3 gap-2">
        {subTabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeSub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSub(t.id)}
              data-testid={`sr-se-req-subtab-${t.id}`}
              className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border-2 transition-all
                ${isActive
                  ? `bg-${t.color}-50 border-${t.color}-400 text-${t.color}-800 font-semibold shadow-sm`
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              <span className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Icon className="h-4 w-4" /> {t.label}
              </span>
              <Badge className={`${isActive ? `bg-${t.color}-600 text-white` : 'bg-gray-100 text-gray-700'} text-[10px]`}>
                {t.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project, vendor, contractor, status…"
          className="pl-8 h-9 text-sm"
          data-testid="sr-se-req-search"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">No {activeSub.replace('_', ' ')} requests in scope.</div>
      )}

      {/* Cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2" data-testid="sr-se-req-list">
          {filtered.map((r, idx) => (
            <RequestCard key={r.request_id || r.expense_id || r.payment_request_id || idx} req={r} kind={activeSub} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ req, kind }) {
  if (kind === 'material') {
    return (
      <Card className="border-l-4 border-l-amber-400" data-testid={`mat-req-card-${req.request_id}`}>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-mono text-xs text-gray-500">{req.request_number || req.request_id}</span>
            <StatusPill status={req.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Field label="Date" value={fmtDate(req.requested_at || req.created_at)} />
            <Field label="Material" value={`${req.material_name || '—'}${req.brand ? ` (${req.brand})` : ''}`} />
            <Field label="Qty" value={`${req.quantity || 0} ${req.unit || ''}`} />
            <Field label="Project" value={req.project_name || '—'} />
            <Field label="SE" value={req.requested_by_name || '—'} />
          </div>
          {req.steel_specs && (
            <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-0.5 inline-block">
              ⚙ Steel Ø{req.steel_specs.diameter_mm}mm × {req.steel_specs.rod_count} rods (40 ft) = {req.steel_specs.calculated_weight_kg} kg
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  if (kind === 'labour_payments') {
    return (
      <Card className="border-l-4 border-l-blue-400" data-testid={`lab-pay-card-${req.request_id}`}>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-mono text-xs text-gray-500">{req.rab_number || req.request_id}</span>
            <StatusPill status={req.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Field label="Date" value={fmtDate(req.requested_at || req.created_at)} />
            <Field label="Contractor" value={req.contractor_name || '—'} />
            <Field label="Stage" value={req.stage_name || '—'} />
            <Field label="Amount" value={fmt(req.amount)} />
            <Field label="Project" value={req.project_name || '—'} />
          </div>
        </CardContent>
      </Card>
    );
  }
  // petty cash
  return (
    <Card className="border-l-4 border-l-emerald-400" data-testid={`petty-card-${req.expense_id || req.request_id}`}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono text-xs text-gray-500">{req.expense_id || req.request_id}</span>
          <StatusPill status={req.status} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <Field label="Date" value={fmtDate(req.requested_at || req.created_at)} />
          <Field label="Category" value={req.category || req.expense_category || '—'} />
          <Field label="Amount" value={fmt(req.amount)} />
          <Field label="Project" value={req.project_name || '—'} />
          <Field label="Requested By" value={req.requested_by_name || req.user_name || '—'} />
        </div>
        {req.description && (
          <p className="text-[11px] text-gray-600 italic">{req.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-medium text-gray-800 truncate">{value || '—'}</p>
    </div>
  );
}
