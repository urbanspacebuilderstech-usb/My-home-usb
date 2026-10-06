import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import DashboardDetailDialog from '../components/DashboardDetailDialog';
import {
  Wallet, Package, HardHat, Users, Building2, UserRound, RefreshCw, ChevronRight, ArrowUpDown, LayoutList,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Aug 29 2026 — same date-preset shape as Sales Masterview.
const PRESETS = {
  today: () => { const d = new Date(); return { start: toYMD(d), end: toYMD(d) }; },
  yesterday: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: toYMD(d), end: toYMD(d) }; },
  week: () => {
    const end = new Date();
    const start = new Date();
    const dow = (start.getDay() + 6) % 7; // Monday-start week
    start.setDate(start.getDate() - dow);
    return { start: toYMD(start), end: toYMD(end) };
  },
  month: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toYMD(start), end: toYMD(now) };
  },
};

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const prettyMode = (m) => (m ? String(m).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Cash');

const EXPENSE_CATS = [
  { key: 'material', label: 'Material' },
  { key: 'labour', label: 'Labour' },
  { key: 'petty_cash', label: 'Petty Cash' },
  { key: 'other', label: 'Other' },
];
const expenseCat = (e) => (['material', 'labour', 'petty_cash'].includes(e.expense_type) ? e.expense_type : 'other');
const PROJECT_STATUS = { new: 'New', active: 'Ongoing', delivered: 'Completed' };
const LABOUR_BUCKETS = { total: 'Total Labour', skilled: 'Skilled', semi_skilled: 'Semi-Skilled', unskilled: 'Unskilled' };
const SALES_LABELS = { leads: 'Leads', appointments: 'Appointments', proposals: 'Proposals (RE - Client)', sales: 'Sales (Deal Close)' };

// One clickable figure: label above, value below, opens its detail popup.
function Metric({ label, value, cls = 'text-gray-800', onClick, testId, big = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={`View ${label} details`}
      className="group w-full rounded-md px-1 py-1 text-center hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors"
    >
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p className={`${big ? 'text-base' : 'text-sm'} font-bold ${cls} group-hover:underline decoration-dotted underline-offset-4`}>{value}</p>
    </button>
  );
}

// Card title that links to the page owning the card's data.
function CardTitleLink({ icon: Icon, iconCls, title, to, testId }) {
  return (
    <Link to={to} className="group flex items-center gap-2 mb-3 w-fit" data-testid={testId} title={`Open ${title}`}>
      <Icon className={`h-4 w-4 ${iconCls}`} />
      <span className="text-sm font-bold text-gray-800 group-hover:text-amber-700">{title}</span>
      <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-amber-600" />
    </Link>
  );
}

// Boxed value used in the Project Value / Financial Performance strips.
function ValueBox({ label, value, onClick, testId, solid, cls }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={`View ${label} details`}
      className={`group rounded-md p-2.5 text-center transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${solid || `bg-white border ${cls.border}`}`}
    >
      <p className={`text-[10px] uppercase font-semibold ${solid ? 'text-white/80' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-sm font-bold mt-1 break-words group-hover:underline decoration-dotted underline-offset-4 ${solid ? 'text-white' : cls.text}`}>{value}</p>
    </button>
  );
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(PRESETS.today());
  const [dLoading, setDLoading] = useState(false);

  const [cashbook, setCashbook] = useState(null);      // accounts + project values (row 3)
  const [inventoryRows, setInventoryRows] = useState([]); // /planning/inventory-summary rows
  const [labour, setLabour] = useState(null);           // {total, skilled, semi_skilled, unskilled, rows}
  const [laps, setLaps] = useState(null);                // {leads, appointments, proposals, sales}
  const [projectsOverview, setProjectsOverview] = useState(null); // {total, new, ongoing, completed, projects}
  const [hr, setHr] = useState(null);                    // {total_staff, present, absent, wfh, staff}

  // Oct 6 2026 — which figure's detail popup is open: { kind, chip? }.
  const [detail, setDetail] = useState(null);
  const [salesRows, setSalesRows] = useState({ category: '', rows: [], loading: false });
  const [projSort, setProjSort] = useState({ key: 'income', dir: -1 });
  const [showAllProjects, setShowAllProjects] = useState(false);

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(r => setUser(r.data))
      .catch((error) => { if (error.response?.status === 401) window.location.href = '/login'; })
      .finally(() => setLoading(false));
    axios.get(`${API}/notifications`)
      .then(r => setUnreadNotifs((r.data || []).filter(n => !n.read).length))
      .catch(() => {});
  }, []);

  const applyPreset = (key) => { setPreset(key); setRange(PRESETS[key]()); };
  const applyCustomDate = (which, value) => {
    if (!value) return;
    setPreset('custom');
    setRange(prev => {
      const next = { ...prev, [which]: value };
      if (next.start > next.end) { if (which === 'start') next.end = value; else next.start = value; }
      return next;
    });
  };

  const fetchAll = useCallback(async () => {
    setDLoading(true);
    const dateParams = new URLSearchParams({ start_date: range.start, end_date: range.end });

    // Aug 29 2026 — every setter (including the final setDLoading(false))
    // now lives in try/finally: a bug or a rejected request used to leave
    // dLoading stuck true forever, which is why every card showed "…"
    // permanently instead of falling back to real numbers or a visible
    // failure. Promise.allSettled already isolates one endpoint's failure
    // from the others; this isolates the RENDER logic the same way.
    try {
      const results = await Promise.allSettled([
        axios.get(`${API}/accountant/cashbook-filtered?${dateParams}`),
        axios.get(`${API}/planning/inventory-summary?${dateParams}`),
        axios.get(`${API}/dashboard/labour-summary?${dateParams}`),
        axios.get(`${API}/crm/sales-masterview/summary?${dateParams}`),
        axios.get(`${API}/dashboard/projects-overview`),
        axios.get(`${API}/dashboard/hr-summary?date=${range.end}`),
      ]);
      const [cbRes, matRes, labRes, lapsRes, projRes, hrRes] = results;

      setCashbook(cbRes.status === 'fulfilled' ? cbRes.value.data : null);
      if (cbRes.status === 'rejected') console.error('cashbook-filtered failed:', cbRes.reason);
      setInventoryRows(matRes.status === 'fulfilled' ? (matRes.value.data?.rows || []) : []);
      if (matRes.status === 'rejected') console.error('inventory-summary failed:', matRes.reason);
      setLabour(labRes.status === 'fulfilled' ? labRes.value.data : null);
      if (labRes.status === 'rejected') console.error('labour-summary failed:', labRes.reason);
      setLaps(lapsRes.status === 'fulfilled' ? lapsRes.value.data : null);
      if (lapsRes.status === 'rejected') console.error('sales-masterview/summary failed:', lapsRes.reason);
      setProjectsOverview(projRes.status === 'fulfilled' ? projRes.value.data : null);
      if (projRes.status === 'rejected') console.error('projects-overview failed:', projRes.reason);
      setHr(hrRes.status === 'fulfilled' ? hrRes.value.data : null);
      if (hrRes.status === 'rejected') console.error('hr-summary failed:', hrRes.reason);
    } finally {
      setDLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Sales rows are only fetched when one of the Sales figures is opened.
  const salesCategory = detail?.kind?.startsWith('sales:') ? detail.kind.slice(6) : '';
  useEffect(() => {
    if (!salesCategory) return undefined;
    let cancelled = false;
    setSalesRows({ category: salesCategory, rows: [], loading: true });
    axios.get(`${API}/crm/sales-masterview/rows`, { params: { category: salesCategory, start_date: range.start, end_date: range.end } })
      .then(r => { if (!cancelled) setSalesRows({ category: salesCategory, rows: r.data?.rows || [], loading: false }); })
      .catch(() => { if (!cancelled) setSalesRows({ category: salesCategory, rows: [], loading: false }); });
    return () => { cancelled = true; };
  }, [salesCategory, range]);

  // ── Derived data (all from what fetchAll already loaded) ──
  const s = cashbook?.summary || {};
  // The headline totals only count "real" projects (cashbook's own scope),
  // so the rows behind them are filtered the same way and add up exactly.
  const realPids = useMemo(() => new Set((cashbook?.projects || []).map(p => p.project_id)), [cashbook]);
  const incomeRows = useMemo(() => (cashbook?.income_entries || []).filter(i => realPids.has(i.project_id)), [cashbook, realPids]);
  const expenseRows = useMemo(() => (cashbook?.expense_entries || []).filter(e => realPids.has(e.project_id)), [cashbook, realPids]);
  const expenseByCat = useMemo(() => {
    const t = { material: 0, labour: 0, petty_cash: 0, other: 0 };
    expenseRows.forEach(e => { t[expenseCat(e)] += Number(e.amount) || 0; });
    return t;
  }, [expenseRows]);

  const materials = useMemo(() => {
    const agg = { total_value: 0, today_in: 0, today_out: 0, lines_in: 0, lines_out: 0 };
    const byProject = {};
    inventoryRows.forEach(r => {
      const rate = Number(r.unit_rate) || 0;
      const sv = r.current_sv != null ? Number(r.current_sv) || 0 : (Number(r.current_stock) || 0) * rate;
      const inV = (Number(r.today_in) || 0) * rate;
      const outV = (Number(r.today_out) || 0) * rate;
      agg.total_value += sv;
      agg.today_in += inV;
      agg.today_out += outV;
      if (Number(r.today_in) > 0) agg.lines_in += 1;
      if (Number(r.today_out) > 0) agg.lines_out += 1;
      const p = byProject[r.project_id] || (byProject[r.project_id] = { project_id: r.project_id, project_name: r.project_name, requests: 0, stock: 0, in: 0, out: 0 });
      p.requests += 1; p.stock += sv; p.in += inV; p.out += outV;
    });
    agg.projects = Object.values(byProject);
    agg.projects_with_stock = agg.projects.filter(p => p.stock > 0).length;
    return agg;
  }, [inventoryRows]);

  const labourByProject = useMemo(() => {
    const m = {};
    (labour?.rows || []).forEach(r => { m[r.project_id] = (m[r.project_id] || 0) + (Number(r.total?.amount) || 0); });
    return m;
  }, [labour]);

  // Project-by-project snapshot for the selected period.
  const projectSnapshot = useMemo(() => {
    const stockBy = {};
    materials.projects.forEach(p => { stockBy[p.project_id] = p.stock; });
    return (cashbook?.project_wise || [])
      .map(p => ({
        project_id: p.project_id,
        project_name: p.project_name,
        income: Number(p.income) || 0,
        expense: Number(p.expense) || 0,
        balance: Number(p.balance) || 0,
        labour: labourByProject[p.project_id] || 0,
        stock: stockBy[p.project_id] || 0,
        receivable: (Number(p.grand_total) || 0) - (Number(p.income) || 0),
      }))
      .filter(p => p.income || p.expense || p.labour || p.stock);
  }, [cashbook, materials, labourByProject]);
  const sortedSnapshot = useMemo(() => {
    const { key, dir } = projSort;
    return [...projectSnapshot].sort((a, b) => (key === 'project_name'
      ? dir * (a.project_name || '').localeCompare(b.project_name || '')
      : dir * ((a[key] || 0) - (b[key] || 0))));
  }, [projectSnapshot, projSort]);

  const open = (kind, chip = '') => setDetail({ kind, chip });
  const goProject = (r) => { if (r.project_id) navigate(`/projects/${r.project_id}`); };
  const periodLabel = range.start === range.end ? fmtDate(range.start) : `${fmtDate(range.start)} → ${fmtDate(range.end)}`;

  // ── The popup for the open figure ──
  const dialogProps = (() => {
    if (!detail) return null;
    const { kind } = detail;
    const projectCol = { key: 'project_name', label: 'Project', className: 'font-medium text-gray-900' };
    const money = (key, label, cls) => ({ key, label, align: 'right', render: r => fmt(r[key]), sum: r => r[key], format: fmt, className: cls });
    const projectWiseRows = (cashbook?.project_wise || []).map(p => ({
      ...p, receivable: (Number(p.grand_total) || 0) - (Number(p.income) || 0),
    }));
    const base = { onRowClick: goProject, rowTitle: 'Open project', searchKeys: ['project_name'] };

    if (kind === 'income') {
      return {
        ...base,
        title: `Income — ${fmt(s.total_income)}`,
        subtitle: `${periodLabel} · every receipt behind the Income figure. Click a row to open the project.`,
        rows: incomeRows,
        searchKeys: ['project_name', 'stage', 'description', 'payment_mode'],
        columns: [
          { key: 'date', label: 'Date', render: r => fmtDate(r.payment_date || r.created_at), className: 'text-gray-500 whitespace-nowrap' },
          projectCol,
          { key: 'stage', label: 'Stage / Description', render: r => r.stage || r.description || '—' },
          { key: 'payment_mode', label: 'Mode', render: r => prettyMode(r.payment_mode || r.payment_method), className: 'text-gray-500' },
          money('amount', 'Amount', 'text-emerald-700 font-semibold'),
        ],
        fullPageHref: '/finance-board?tab=accounts', fullPageLabel: 'Open Finance Board › Accounts',
      };
    }
    if (kind === 'expense') {
      return {
        ...base,
        title: `Expense — ${fmt(s.total_expense)}`,
        subtitle: `${periodLabel} · every payment behind the Expense figure. Click a row to open the project.`,
        rows: expenseRows,
        searchKeys: ['project_name', 'material_name', 'description', 'vendor_name'],
        chips: EXPENSE_CATS.map(c => ({ key: c.key, label: c.label, value: fmt(expenseByCat[c.key]) })),
        chipFilter: (r, k) => expenseCat(r) === k,
        initialChip: detail.chip,
        columns: [
          { key: 'date', label: 'Date', render: r => fmtDate(r.payment_date || r.created_at), className: 'text-gray-500 whitespace-nowrap' },
          projectCol,
          { key: 'category', label: 'Type', render: r => EXPENSE_CATS.find(c => c.key === expenseCat(r))?.label, className: 'text-gray-500' },
          { key: 'description', label: 'Description', render: r => r.material_name || r.description || r.stage || '—' },
          { key: 'vendor_name', label: 'Vendor / Contractor', render: r => r.vendor_name || r.contractor_name || '—', className: 'text-gray-500' },
          { key: 'payment_mode', label: 'Mode', render: r => prettyMode(r.payment_mode || r.payment_method), className: 'text-gray-500' },
          money('amount', 'Amount', 'text-red-700 font-semibold'),
        ],
        fullPageHref: '/finance-board?tab=accounts', fullPageLabel: 'Open Finance Board › Accounts',
      };
    }
    if (kind === 'balance') {
      return {
        ...base,
        title: `Balance — ${fmt(s.net_balance)}`,
        subtitle: `${periodLabel} · income less expense, project by project.`,
        rows: projectWiseRows.filter(p => p.income || p.expense).sort((a, b) => a.balance - b.balance),
        columns: [projectCol, money('income', 'Income', 'text-emerald-700'), money('expense', 'Expense', 'text-red-700'), money('balance', 'Balance', 'text-blue-700 font-semibold')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise',
      };
    }
    if (['scope_value', 'additions', 'deductions', 'grand_total'].includes(kind)) {
      const labels = { scope_value: 'Scope Value', additions: 'Additions', deductions: 'Deductions', grand_total: 'Grand Total' };
      const headline = { scope_value: s.scope_value, additions: s.additions_total, deductions: s.deductions_total, grand_total: s.grand_total_value };
      return {
        ...base,
        title: `${labels[kind]} — ${fmt(headline[kind])}`,
        subtitle: 'Project value across all live projects (Scope + Additions − Deductions = Grand Total).',
        rows: projectWiseRows.filter(p => Number(p[kind]) !== 0).sort((a, b) => (b[kind] || 0) - (a[kind] || 0)),
        columns: [projectCol, money('scope_value', 'Scope', 'text-blue-700'), money('additions', 'Additions', 'text-cyan-700'), money('deductions', 'Deductions', 'text-orange-700'), money('grand_total', 'Grand Total', 'text-indigo-700 font-semibold')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise',
      };
    }
    if (kind === 'receivable') {
      return {
        ...base,
        title: `Receivable — ${fmt(s.receivable)}`,
        subtitle: `Grand Total less income received in ${periodLabel}, project by project.`,
        rows: projectWiseRows.filter(p => p.receivable).sort((a, b) => b.receivable - a.receivable),
        columns: [projectCol, money('grand_total', 'Grand Total', 'text-indigo-700'), money('income', 'Income', 'text-emerald-700'), money('receivable', 'Receivable', 'text-amber-700 font-semibold')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise',
      };
    }
    if (kind === 'mat_in' || kind === 'mat_out') {
      const isIn = kind === 'mat_in';
      const qtyKey = isIn ? 'today_in' : 'today_out';
      return {
        ...base,
        title: `${isIn ? 'Inward' : 'Outward'} — ${fmt(isIn ? materials.today_in : materials.today_out)}`,
        subtitle: `${periodLabel} · material ${isIn ? 'received' : 'used'}, request by request.`,
        rows: inventoryRows.filter(r => Number(r[qtyKey]) > 0).map(r => ({ ...r, value: (Number(r[qtyKey]) || 0) * (Number(r.unit_rate) || 0) })),
        searchKeys: ['project_name', 'material_name', 'request_number'],
        columns: [
          projectCol,
          { key: 'material_name', label: 'Material' },
          { key: 'request_number', label: 'Request', className: 'font-mono text-[11px] text-gray-500' },
          { key: 'qty', label: 'Qty', align: 'right', render: r => `${num(r[qtyKey])} ${r.unit || ''}` },
          { key: 'unit_rate', label: 'Rate', align: 'right', render: r => fmt(r.unit_rate), className: 'text-gray-500' },
          money('value', 'Value', isIn ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'),
        ],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise › Material',
      };
    }
    if (kind === 'mat_total') {
      return {
        ...base,
        title: `Total Material — ${fmt(materials.total_value)}`,
        subtitle: 'Current stock value held at each project.',
        rows: [...materials.projects].sort((a, b) => b.stock - a.stock),
        columns: [projectCol, { key: 'requests', label: 'Requests', align: 'right', sum: r => r.requests, format: num }, money('stock', 'Stock Value', 'text-indigo-700 font-semibold'), money('in', 'Inward', 'text-emerald-700'), money('out', 'Outward', 'text-red-700')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise › Material',
      };
    }
    if (kind.startsWith('labour:')) {
      const b = kind.slice(7);
      const head = labour?.[b] || {};
      return {
        ...base,
        title: `${LABOUR_BUCKETS[b]} — ${num(head.count)} · ${fmt(head.amount)}`,
        subtitle: `${periodLabel} · from daily labour reports, by project and contractor.`,
        rows: (labour?.rows || []).filter(r => Number(r[b]?.count) > 0 || Number(r[b]?.amount) > 0),
        searchKeys: ['project_name', 'contractor_name'],
        columns: [
          projectCol,
          { key: 'contractor_name', label: 'Contractor', render: r => r.contractor_name || '—' },
          { key: 'days', label: 'Days', align: 'right', className: 'text-gray-500' },
          ...(b === 'total' ? [
            { key: 'sk', label: 'Skilled', align: 'right', render: r => num(r.skilled?.count), sum: r => r.skilled?.count, format: num, className: 'text-blue-700' },
            { key: 'ss', label: 'Semi', align: 'right', render: r => num(r.semi_skilled?.count), sum: r => r.semi_skilled?.count, format: num, className: 'text-amber-700' },
            { key: 'us', label: 'Unskilled', align: 'right', render: r => num(r.unskilled?.count), sum: r => r.unskilled?.count, format: num, className: 'text-gray-600' },
          ] : []),
          { key: 'count', label: 'Labour', align: 'right', render: r => num(r[b]?.count), sum: r => r[b]?.count, format: num, className: 'font-medium' },
          { key: 'amount', label: 'Amount', align: 'right', render: r => fmt(r[b]?.amount), sum: r => r[b]?.amount, format: fmt, className: 'text-amber-700 font-semibold' },
        ],
        fullPageHref: '/finance-board?tab=labour', fullPageLabel: 'Open Finance Board › Labour Payments',
      };
    }
    if (kind.startsWith('sales:')) {
      const cat = kind.slice(6);
      return {
        title: `${SALES_LABELS[cat]} — ${num(laps?.[cat])}`,
        subtitle: `${periodLabel} · the leads behind this figure.`,
        rows: salesRows.category === cat ? salesRows.rows : [],
        loading: salesRows.loading || salesRows.category !== cat,
        searchKeys: ['name', 'phone', 'source', 'assigned_to_name', 'current_stage_name'],
        columns: [
          { key: 'when', label: 'Date', render: r => fmtDate(r.when), className: 'text-gray-500 whitespace-nowrap' },
          { key: 'name', label: 'Name', className: 'font-medium text-gray-900' },
          { key: 'phone', label: 'Phone', className: 'text-gray-500' },
          { key: 'source', label: 'Source', render: r => r.source || '—', className: 'text-gray-500' },
          { key: 'current_stage_name', label: 'Current Stage', render: r => r.current_stage_name || '—' },
          { key: 'assigned_to_name', label: 'Assigned To', render: r => r.assigned_to_name || '—', className: 'text-gray-500' },
        ],
        fullPageHref: '/sales-board', fullPageLabel: 'Open Sales Board',
      };
    }
    if (kind.startsWith('proj:')) {
      const st = kind.slice(5);
      const statusKey = { new: 'new', ongoing: 'active', completed: 'delivered' }[st];
      const list = (projectsOverview?.projects || []).filter(p => !statusKey || p.planning_status === statusKey);
      return {
        ...base,
        title: `${{ total: 'All Projects', new: 'New Projects', ongoing: 'Ongoing Projects', completed: 'Completed Projects' }[st]} — ${list.length}`,
        subtitle: 'Current status (not affected by the date filter). Click a row to open the project.',
        rows: list,
        searchKeys: ['name', 'client_name', 'location'],
        columns: [
          { key: 'name', label: 'Project', className: 'font-medium text-gray-900' },
          { key: 'client_name', label: 'Client', render: r => r.client_name || '—' },
          { key: 'location', label: 'Location', render: r => (typeof r.location === 'string' ? r.location : r.location?.address) || '—', className: 'text-gray-500' },
          { key: 'planning_status', label: 'Status', render: r => PROJECT_STATUS[r.planning_status] || r.planning_status },
          { key: 'created_at', label: 'Created', render: r => fmtDate(r.created_at), className: 'text-gray-500 whitespace-nowrap' },
        ],
        fullPageHref: '/planning-board', fullPageLabel: 'Open Planning Board',
      };
    }
    if (kind.startsWith('hr:')) {
      const which = kind.slice(3);
      const staff = (hr?.staff || []).filter(p => which === 'total' || (which === 'present' ? p.is_present : !p.is_present));
      const statusCls = { present: 'text-emerald-700 bg-emerald-50 border-emerald-200', wfh: 'text-sky-700 bg-sky-50 border-sky-200' };
      return {
        title: `${{ total: 'All Employees', present: 'Present', absent: 'Absent' }[which]} — ${staff.length}`,
        subtitle: `Attendance on ${fmtDate(hr?.date || range.end)}.`,
        rows: staff,
        searchKeys: ['name', 'designation', 'department'],
        columns: [
          { key: 'name', label: 'Name', className: 'font-medium text-gray-900' },
          { key: 'designation', label: 'Designation', render: r => r.designation || '—' },
          { key: 'department', label: 'Department', render: r => r.department || '—', className: 'text-gray-500' },
          {
            key: 'attendance_status', label: 'Status',
            render: r => (
              <span className={`inline-flex text-[10px] font-semibold border px-1.5 py-0.5 rounded-full capitalize ${statusCls[r.attendance_status] || 'text-red-700 bg-red-50 border-red-200'}`}>
                {r.attendance_status === 'wfh' ? 'WFH' : String(r.attendance_status || 'absent').replace(/_/g, ' ')}
              </span>
            ),
          },
          { key: 'check_in', label: 'Check-in', render: r => (r.check_in ? `${fmtTime(r.check_in)}${r.is_late ? ' (late)' : ''}` : '—'), className: 'text-gray-500 whitespace-nowrap' },
          { key: 'check_out', label: 'Check-out', render: r => fmtTime(r.check_out), className: 'text-gray-500 whitespace-nowrap' },
        ],
        fullPageHref: '/hr-portal', fullPageLabel: 'Open HR Portal',
      };
    }
    return null;
  })();

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const v = (x) => (dLoading ? '…' : x);
  const sortHeader = (key, label, align = 'right') => (
    <th className={`px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => setProjSort(p => ({ key, dir: p.key === key ? -p.dir : (key === 'project_name' ? 1 : -1) }))}
        className={`inline-flex items-center gap-1 uppercase hover:text-amber-700 ${projSort.key === key ? 'text-amber-700' : ''}`}
        data-testid={`dashboard-projects-sort-${key}`}
      >
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
  const snapshotRows = showAllProjects ? sortedSnapshot : sortedSnapshot.slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="super-admin-dashboard-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="w-full px-4 sm:px-6 lg:px-10 py-5 pb-24 lg:pb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="dashboard-title">Dashboard</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {range.start === range.end ? range.start : `${range.start} → ${range.end}`} · click any figure for its details
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={dLoading}
            data-testid="dashboard-refresh"
            className="h-9 w-9 rounded-md border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${dLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Date range: presets + custom */}
        <div className="flex items-center gap-3 mb-5 flex-wrap" data-testid="dashboard-date-filter">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { k: 'today', label: 'Today' },
              { k: 'yesterday', label: 'Yesterday' },
              { k: 'week', label: 'This Week' },
              { k: 'month', label: 'This Month' },
            ].map(p => (
              <button
                key={p.k}
                onClick={() => applyPreset(p.k)}
                data-testid={`dashboard-preset-${p.k}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  preset === p.k ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-3 pr-1.5 py-1">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Custom</span>
            <input type="date" value={range.start} max={range.end} onChange={(e) => applyCustomDate('start', e.target.value)} className="text-xs border-0 focus:outline-none focus:ring-0 bg-transparent" data-testid="dashboard-custom-start" />
            <span className="text-gray-300">→</span>
            <input type="date" value={range.end} min={range.start} onChange={(e) => applyCustomDate('end', e.target.value)} className="text-xs border-0 focus:outline-none focus:ring-0 bg-transparent" data-testid="dashboard-custom-end" />
          </div>
        </div>

        {/* ── Row 1: Accounts | Materials | Labour ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <Card className="border-t-4 border-t-blue-400" data-testid="dashboard-card-accounts">
            <CardContent className="p-4">
              <CardTitleLink icon={Wallet} iconCls="text-blue-600" title="Accounts" to="/finance-board?tab=accounts" testId="dashboard-link-accounts" />
              <div className="grid grid-cols-3 gap-1">
                <Metric label="Income" value={v(fmt(s.total_income))} cls="text-emerald-700" onClick={() => open('income')} testId="dashboard-metric-income" />
                <Metric label="Expense" value={v(fmt(s.total_expense))} cls="text-red-700" onClick={() => open('expense')} testId="dashboard-metric-expense" />
                <Metric label="Balance" value={v(fmt(s.net_balance))} cls="text-blue-700" onClick={() => open('balance')} testId="dashboard-metric-balance" />
              </div>
              <div className="mt-3 pt-3 border-t border-dashed">
                <p className="text-[10px] text-gray-400 uppercase mb-1">Expense split · {incomeRows.length} receipts · {expenseRows.length} payments</p>
                <div className="grid grid-cols-4 gap-1">
                  {EXPENSE_CATS.map(c => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => open('expense', c.key)}
                      data-testid={`dashboard-expense-split-${c.key}`}
                      className="group rounded px-1 py-0.5 text-center hover:bg-gray-50"
                      title={`View ${c.label} expenses`}
                    >
                      <p className="text-[10px] text-gray-500">{c.label}</p>
                      <p className="text-xs font-semibold text-gray-800 group-hover:underline decoration-dotted underline-offset-4">{v(fmt(expenseByCat[c.key]))}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-400" data-testid="dashboard-card-materials">
            <CardContent className="p-4">
              <CardTitleLink icon={Package} iconCls="text-indigo-600" title="Materials" to="/finance-board?tab=projects" testId="dashboard-link-materials" />
              <div className="grid grid-cols-3 gap-1">
                <Metric label="Today Inward" value={v(fmt(materials.today_in))} cls="text-emerald-700" onClick={() => open('mat_in')} testId="dashboard-metric-mat-in" />
                <Metric label="Today Outward" value={v(fmt(materials.today_out))} cls="text-red-700" onClick={() => open('mat_out')} testId="dashboard-metric-mat-out" />
                <Metric label="Total Material" value={v(fmt(materials.total_value))} cls="text-indigo-700" onClick={() => open('mat_total')} testId="dashboard-metric-mat-total" />
              </div>
              <div className="mt-3 pt-3 border-t border-dashed grid grid-cols-3 gap-1">
                <Metric label="Lines In" value={v(num(materials.lines_in))} cls="text-emerald-700" onClick={() => open('mat_in')} testId="dashboard-metric-mat-lines-in" />
                <Metric label="Lines Out" value={v(num(materials.lines_out))} cls="text-red-700" onClick={() => open('mat_out')} testId="dashboard-metric-mat-lines-out" />
                <Metric label="Projects w/ Stock" value={v(num(materials.projects_with_stock))} cls="text-indigo-700" onClick={() => open('mat_total')} testId="dashboard-metric-mat-projects" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-amber-400" data-testid="dashboard-card-labour">
            <CardContent className="p-4">
              <CardTitleLink icon={HardHat} iconCls="text-amber-600" title="Labour" to="/finance-board?tab=labour" testId="dashboard-link-labour" />
              <div className="space-y-0.5">
                {[
                  { key: 'total', d: labour?.total, cls: 'text-gray-800' },
                  { key: 'skilled', d: labour?.skilled, cls: 'text-blue-700' },
                  { key: 'semi_skilled', d: labour?.semi_skilled, cls: 'text-amber-700' },
                  { key: 'unskilled', d: labour?.unskilled, cls: 'text-gray-600' },
                ].map(row => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => open(`labour:${row.key}`)}
                    data-testid={`dashboard-metric-labour-${row.key}`}
                    className="group w-full flex items-center justify-between text-xs rounded px-1 py-1 hover:bg-gray-50"
                    title={`View ${LABOUR_BUCKETS[row.key]} details`}
                  >
                    <span className="text-gray-500">{LABOUR_BUCKETS[row.key]}</span>
                    <span className={`font-semibold ${row.cls} group-hover:underline decoration-dotted underline-offset-4`}>
                      {v(`${row.d?.count ?? 0} · ${fmt(row.d?.amount)}`)}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 px-1">
                {v(`${new Set((labour?.rows || []).map(r => r.project_id)).size} projects · ${(labour?.rows || []).length} contractor sites`)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 2: Sales (LAPS) | Projects Overview | HR ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <Card className="border-t-4 border-t-rose-400" data-testid="dashboard-card-sales">
            <CardContent className="p-4">
              <CardTitleLink icon={Users} iconCls="text-rose-600" title="Sales (LAPS)" to="/sales-board" testId="dashboard-link-sales" />
              <div className="grid grid-cols-4 gap-1">
                <Metric big label="Leads" value={v(laps?.leads ?? 0)} cls="text-indigo-700" onClick={() => open('sales:leads')} testId="dashboard-metric-sales-leads" />
                <Metric big label="Appt" value={v(laps?.appointments ?? 0)} cls="text-emerald-700" onClick={() => open('sales:appointments')} testId="dashboard-metric-sales-appointments" />
                <Metric big label="Proposal" value={v(laps?.proposals ?? 0)} cls="text-amber-700" onClick={() => open('sales:proposals')} testId="dashboard-metric-sales-proposals" />
                <Metric big label="Sales" value={v(laps?.sales ?? 0)} cls="text-rose-700" onClick={() => open('sales:sales')} testId="dashboard-metric-sales-sales" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-400" data-testid="dashboard-card-projects">
            <CardContent className="p-4">
              <CardTitleLink icon={Building2} iconCls="text-emerald-600" title="Projects Overview" to="/planning-board" testId="dashboard-link-projects" />
              <div className="grid grid-cols-4 gap-1">
                <Metric big label="Total" value={v(projectsOverview?.total ?? 0)} onClick={() => open('proj:total')} testId="dashboard-metric-proj-total" />
                <Metric big label="New" value={v(projectsOverview?.new ?? 0)} cls="text-indigo-700" onClick={() => open('proj:new')} testId="dashboard-metric-proj-new" />
                <Metric big label="Ongoing" value={v(projectsOverview?.ongoing ?? 0)} cls="text-amber-700" onClick={() => open('proj:ongoing')} testId="dashboard-metric-proj-ongoing" />
                <Metric big label="Completed" value={v(projectsOverview?.completed ?? 0)} cls="text-emerald-700" onClick={() => open('proj:completed')} testId="dashboard-metric-proj-completed" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-violet-400" data-testid="dashboard-card-hr">
            <CardContent className="p-4">
              <CardTitleLink icon={UserRound} iconCls="text-violet-600" title="HR" to="/hr-portal" testId="dashboard-link-hr" />
              <div className="grid grid-cols-3 gap-1">
                <Metric label="Total Employees" value={v(hr?.total_staff ?? 0)} onClick={() => open('hr:total')} testId="dashboard-metric-hr-total" />
                <Metric label="Present" value={v(hr?.present ?? 0)} cls="text-emerald-700" onClick={() => open('hr:present')} testId="dashboard-metric-hr-present" />
                <Metric label="Absent" value={v(hr?.absent ?? 0)} cls="text-red-700" onClick={() => open('hr:absent')} testId="dashboard-metric-hr-absent" />
              </div>
              <p className="text-[10px] text-gray-400 mt-2 px-1">
                Attendance on {fmtDate(hr?.date || range.end)}{hr?.wfh ? ` · ${hr.wfh} working from home` : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3: Project Values — same card as Finance Board > Accounts > Project Wise ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3" data-testid="dashboard-card-project-values">
          <Card className="border-t-4 border-t-indigo-300 bg-indigo-50/30">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-indigo-700/80 font-bold mb-2">Project Value Calculation</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <ValueBox label="Scope Value" value={v(fmt(s.scope_value))} cls={{ border: 'border-blue-200', text: 'text-blue-700' }} onClick={() => open('scope_value')} testId="dashboard-metric-scope" />
                <ValueBox label="Additions" value={v(fmt(s.additions_total))} cls={{ border: 'border-cyan-200', text: 'text-cyan-700' }} onClick={() => open('additions')} testId="dashboard-metric-additions" />
                <ValueBox label="Deductions" value={v(fmt(s.deductions_total))} cls={{ border: 'border-orange-200', text: 'text-orange-700' }} onClick={() => open('deductions')} testId="dashboard-metric-deductions" />
                <ValueBox label="Grand Total" value={v(fmt(s.grand_total_value))} solid="bg-indigo-600" onClick={() => open('grand_total')} testId="dashboard-metric-grand-total" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-300 bg-emerald-50/30">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-bold mb-2">Financial Performance</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <ValueBox label="Income" value={v(fmt(s.total_income))} cls={{ border: 'border-emerald-200', text: 'text-emerald-700' }} onClick={() => open('income')} testId="dashboard-metric-fp-income" />
                <ValueBox label="Expense" value={v(fmt(s.total_expense))} cls={{ border: 'border-red-200', text: 'text-red-700' }} onClick={() => open('expense')} testId="dashboard-metric-fp-expense" />
                <ValueBox label="Balance" value={v(fmt(s.net_balance))} cls={{ border: 'border-blue-200', text: 'text-blue-700' }} onClick={() => open('balance')} testId="dashboard-metric-fp-balance" />
                <ValueBox label="Receivable" value={v(fmt(s.receivable))} solid="bg-amber-600" onClick={() => open('receivable')} testId="dashboard-metric-receivable" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 4: Project-by-project snapshot for the period ── */}
        <Card className="border-t-4 border-t-gray-300" data-testid="dashboard-card-project-snapshot">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-bold text-gray-800">Projects — {periodLabel}</span>
                <span className="text-[11px] text-gray-400">{projectSnapshot.length} with activity · click a row to open the project</span>
              </div>
              <Link to="/finance-board?tab=projects" className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800" data-testid="dashboard-link-project-wise">
                Finance Board › Project Wise <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="dashboard-projects-table">
                <thead className="bg-gray-50 border-y">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">#</th>
                    {sortHeader('project_name', 'Project', 'left')}
                    {sortHeader('income', 'Income')}
                    {sortHeader('expense', 'Expense')}
                    {sortHeader('balance', 'Balance')}
                    {sortHeader('labour', 'Labour')}
                    {sortHeader('stock', 'Material Stock')}
                    {sortHeader('receivable', 'Receivable')}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dLoading ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
                  ) : snapshotRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">No project activity in this period.</td></tr>
                  ) : snapshotRows.map((p, idx) => (
                    <tr key={p.project_id} className="hover:bg-amber-50/60 cursor-pointer" onClick={() => goProject(p)} data-testid={`dashboard-projects-row-${idx}`}>
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{p.project_name}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap">{fmt(p.income)}</td>
                      <td className="px-3 py-2 text-right text-red-700 whitespace-nowrap">{fmt(p.expense)}</td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${p.balance < 0 ? 'text-red-700' : 'text-blue-700'}`}>{fmt(p.balance)}</td>
                      <td className="px-3 py-2 text-right text-amber-700 whitespace-nowrap">{fmt(p.labour)}</td>
                      <td className="px-3 py-2 text-right text-indigo-700 whitespace-nowrap">{fmt(p.stock)}</td>
                      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmt(p.receivable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedSnapshot.length > 10 && (
              <div className="px-4 py-2 border-t text-center">
                <button type="button" onClick={() => setShowAllProjects(x => !x)} className="text-xs font-medium text-amber-700 hover:text-amber-800" data-testid="dashboard-projects-toggle">
                  {showAllProjects ? 'Show top 10' : `Show all ${sortedSnapshot.length} projects`}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dialogProps && (
        <DashboardDetailDialog
          key={`${detail.kind}-${detail.chip}`}
          open={!!detail}
          onOpenChange={(o) => { if (!o) setDetail(null); }}
          {...dialogProps}
        />
      )}
      <MobileBottomNav user={user} />
    </div>
  );
}
