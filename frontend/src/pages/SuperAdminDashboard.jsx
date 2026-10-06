import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import DashboardDetailDialog from '../components/DashboardDetailDialog';
import {
  ChartCard, Legend, KpiTile, StatusBadge, TrendColumns, HBars, RankRows, Meter, ShareBar,
} from '../components/dashboard/DashboardCharts';
import { useChartTheme, inrCompact } from '../components/dashboard/chartTheme';
import {
  RefreshCw, ChevronRight, ArrowUpDown, ArrowDownLeft, ArrowUpRight, Scale, HandCoins, Package, HardHat,
  TrendingUp, TrendingDown, Calendar,
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

const fmt = (n) => `${Number(n) < 0 ? '-' : ''}₹${Math.abs(Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const prettyMode = (m) => (m ? String(m).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Cash');
const localDate = (ymd) => new Date(`${ymd}T00:00:00`);
const daysBetween = (a, b) => Math.round((localDate(b) - localDate(a)) / 86400000) + 1;
// The day a cashbook row belongs to — created_at first, the same field the
// backend filters the period on.
const dayKey = (r) => String(r.created_at || r.payment_date || r.date || '').slice(0, 10);

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

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const t = useChartTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Oct 6 2026 — opens on This Month: the trend charts need a range to show.
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(PRESETS.month());
  const [dLoading, setDLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [cashbook, setCashbook] = useState(null);      // accounts + project values
  const [inventoryRows, setInventoryRows] = useState([]); // /planning/inventory-summary rows
  const [labour, setLabour] = useState(null);           // {total, skilled, semi_skilled, unskilled, rows}
  const [laps, setLaps] = useState(null);                // {leads, appointments, proposals, sales}
  const [projectsOverview, setProjectsOverview] = useState(null); // {total, new, ongoing, completed, projects}
  const [hr, setHr] = useState(null);                    // {total_staff, present, absent, wfh, staff}

  // Which figure's detail popup is open: { kind, chip?, period? }.
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
    // dLoading stuck true forever. Promise.allSettled already isolates one
    // endpoint's failure from the others; this isolates the RENDER logic.
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
      setLoadedOnce(true);
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
    const tot = { material: 0, labour: 0, petty_cash: 0, other: 0 };
    expenseRows.forEach(e => { tot[expenseCat(e)] += Number(e.amount) || 0; });
    return tot;
  }, [expenseRows]);

  // A row dated outside the window (e.g. back-dated payment_date) is kept
  // in the nearest edge bucket, so the chart always totals to the KPI.
  const clampKey = useCallback((k) => (!k || k < range.start ? range.start : (k > range.end ? range.end : k)), [range]);

  // Income vs expense per day (per month past ~2 months).
  const cashflow = useMemo(() => {
    const monthly = daysBetween(range.start, range.end) > 62;
    const bucketOf = (k) => (monthly ? k.slice(0, 7) : k);
    const buckets = new Map();
    for (let d = localDate(range.start); d <= localDate(range.end); d.setDate(d.getDate() + 1)) {
      const k = toYMD(d);
      const b = bucketOf(k);
      if (!buckets.has(b)) {
        buckets.set(b, {
          key: b, start: k, end: k, income: 0, expense: 0,
          label: monthly
            ? d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
            : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        });
      }
      buckets.get(b).end = k;
    }
    incomeRows.forEach(r => { const b = buckets.get(bucketOf(clampKey(dayKey(r)))); if (b) b.income += Number(r.amount) || 0; });
    expenseRows.forEach(r => { const b = buckets.get(bucketOf(clampKey(dayKey(r)))); if (b) b.expense += Number(r.amount) || 0; });
    return { monthly, data: [...buckets.values()] };
  }, [incomeRows, expenseRows, range, clampKey]);

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

  const topProjects = useMemo(() => [...projectSnapshot]
    .filter(p => p.income || p.expense)
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
    .slice(0, 8)
    .map(p => ({ ...p, label: p.project_name })), [projectSnapshot]);
  const stockByProject = useMemo(() => [...materials.projects]
    .filter(p => p.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 8)
    .map(p => ({ ...p, label: p.project_name })), [materials]);

  const open = (kind, chip = '', period = null) => setDetail({ kind, chip, period });
  const goProject = (r) => { if (r.project_id) navigate(`/projects/${r.project_id}`); };
  const periodLabel = range.start === range.end ? fmtDate(range.start) : `${fmtDate(range.start)} – ${fmtDate(range.end)}`;

  // ── The popup for the open figure ──
  const dialogProps = (() => {
    if (!detail) return null;
    const { kind, period } = detail;
    const projectCol = { key: 'project_name', label: 'Project', className: 'font-medium text-gray-900' };
    const money = (key, label, cls) => ({ key, label, align: 'right', render: r => fmt(r[key]), sum: r => r[key], format: fmt, className: cls });
    const projectWiseRows = (cashbook?.project_wise || []).map(p => ({
      ...p, receivable: (Number(p.grand_total) || 0) - (Number(p.income) || 0),
    }));
    const base = { onRowClick: goProject, rowTitle: 'Open project', searchKeys: ['project_name'] };
    // A bar on the cash-flow chart narrows Income/Expense to its day or month.
    const inPeriod = (r) => { if (!period) return true; const k = clampKey(dayKey(r)); return k >= period.start && k <= period.end; };
    const when = period ? period.label : periodLabel;

    if (kind === 'income') {
      const rows = incomeRows.filter(inPeriod);
      return {
        ...base,
        title: `Income · ${when} — ${fmt(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0))}`,
        subtitle: 'Every receipt behind the Income figure. Click a row to open the project.',
        rows,
        searchKeys: ['project_name', 'stage', 'description', 'payment_mode'],
        columns: [
          { key: 'date', label: 'Date', render: r => fmtDate(r.payment_date || r.created_at), className: 'text-gray-500 whitespace-nowrap' },
          projectCol,
          { key: 'stage', label: 'Stage / Description', render: r => r.stage || r.description || '—' },
          { key: 'payment_mode', label: 'Mode', render: r => prettyMode(r.payment_mode || r.payment_method), className: 'text-gray-500' },
          money('amount', 'Amount', 'text-gray-900 font-semibold'),
        ],
        fullPageHref: '/finance-board?tab=accounts', fullPageLabel: 'Open Finance Board › Accounts',
      };
    }
    if (kind === 'expense') {
      const rows = expenseRows.filter(inPeriod);
      return {
        ...base,
        title: `Expense · ${when} — ${fmt(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0))}`,
        subtitle: 'Every payment behind the Expense figure. Click a row to open the project.',
        rows,
        searchKeys: ['project_name', 'material_name', 'description', 'vendor_name'],
        chips: EXPENSE_CATS.map(c => ({ key: c.key, label: c.label, value: fmt(rows.filter(r => expenseCat(r) === c.key).reduce((a, r) => a + (Number(r.amount) || 0), 0)) })),
        chipFilter: (r, k) => expenseCat(r) === k,
        initialChip: detail.chip,
        columns: [
          { key: 'date', label: 'Date', render: r => fmtDate(r.payment_date || r.created_at), className: 'text-gray-500 whitespace-nowrap' },
          projectCol,
          { key: 'category', label: 'Type', render: r => EXPENSE_CATS.find(c => c.key === expenseCat(r))?.label, className: 'text-gray-500' },
          { key: 'description', label: 'Description', render: r => r.material_name || r.description || r.stage || '—' },
          { key: 'vendor_name', label: 'Vendor / Contractor', render: r => r.vendor_name || r.contractor_name || '—', className: 'text-gray-500' },
          { key: 'payment_mode', label: 'Mode', render: r => prettyMode(r.payment_mode || r.payment_method), className: 'text-gray-500' },
          money('amount', 'Amount', 'text-gray-900 font-semibold'),
        ],
        fullPageHref: '/finance-board?tab=accounts', fullPageLabel: 'Open Finance Board › Accounts',
      };
    }
    if (kind === 'balance') {
      return {
        ...base,
        title: `Net balance · ${periodLabel} — ${fmt(s.net_balance)}`,
        subtitle: 'Income less expense, project by project.',
        rows: projectWiseRows.filter(p => p.income || p.expense).sort((a, b) => a.balance - b.balance),
        columns: [projectCol, money('income', 'Income'), money('expense', 'Expense'), money('balance', 'Balance', 'font-semibold text-gray-900')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise',
      };
    }
    if (['scope_value', 'additions', 'deductions', 'grand_total'].includes(kind)) {
      const labels = { scope_value: 'Scope value', additions: 'Additions', deductions: 'Deductions', grand_total: 'Grand total' };
      const headline = { scope_value: s.scope_value, additions: s.additions_total, deductions: s.deductions_total, grand_total: s.grand_total_value };
      return {
        ...base,
        title: `${labels[kind]} — ${fmt(headline[kind])}`,
        subtitle: 'Project value across all live projects (Scope + Additions − Deductions = Grand total).',
        rows: projectWiseRows.filter(p => Number(p[kind]) !== 0).sort((a, b) => (b[kind] || 0) - (a[kind] || 0)),
        columns: [projectCol, money('scope_value', 'Scope'), money('additions', 'Additions'), money('deductions', 'Deductions'), money('grand_total', 'Grand total', 'font-semibold text-gray-900')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise',
      };
    }
    if (kind === 'receivable') {
      return {
        ...base,
        title: `Receivable — ${fmt(s.receivable)}`,
        subtitle: `Grand total less income received in ${periodLabel}, project by project.`,
        rows: projectWiseRows.filter(p => p.receivable).sort((a, b) => b.receivable - a.receivable),
        columns: [projectCol, money('grand_total', 'Grand total'), money('income', 'Income'), money('receivable', 'Receivable', 'font-semibold text-gray-900')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise',
      };
    }
    if (kind === 'mat_in' || kind === 'mat_out') {
      const isIn = kind === 'mat_in';
      const qtyKey = isIn ? 'today_in' : 'today_out';
      return {
        ...base,
        title: `Material ${isIn ? 'inward' : 'outward'} · ${periodLabel} — ${fmt(isIn ? materials.today_in : materials.today_out)}`,
        subtitle: `Material ${isIn ? 'received' : 'used'}, request by request.`,
        rows: inventoryRows.filter(r => Number(r[qtyKey]) > 0).map(r => ({ ...r, value: (Number(r[qtyKey]) || 0) * (Number(r.unit_rate) || 0) })),
        searchKeys: ['project_name', 'material_name', 'request_number'],
        columns: [
          projectCol,
          { key: 'material_name', label: 'Material' },
          { key: 'request_number', label: 'Request', className: 'font-mono text-xs text-gray-500' },
          { key: 'qty', label: 'Qty', align: 'right', render: r => `${num(r[qtyKey])} ${r.unit || ''}` },
          { key: 'unit_rate', label: 'Rate', align: 'right', render: r => fmt(r.unit_rate), className: 'text-gray-500' },
          money('value', 'Value', 'text-gray-900 font-semibold'),
        ],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise › Material',
      };
    }
    if (kind === 'mat_total') {
      return {
        ...base,
        title: `Material stock — ${fmt(materials.total_value)}`,
        subtitle: 'Current stock value held at each project.',
        rows: [...materials.projects].sort((a, b) => b.stock - a.stock),
        columns: [projectCol, { key: 'requests', label: 'Requests', align: 'right', sum: r => r.requests, format: num }, money('stock', 'Stock value', 'font-semibold text-gray-900'), money('in', 'Inward'), money('out', 'Outward')],
        fullPageHref: '/finance-board?tab=projects', fullPageLabel: 'Open Finance Board › Project Wise › Material',
      };
    }
    if (kind.startsWith('labour:')) {
      const b = kind.slice(7);
      const head = labour?.[b] || {};
      return {
        ...base,
        title: `${LABOUR_BUCKETS[b]} · ${periodLabel} — ${num(head.count)} · ${fmt(head.amount)}`,
        subtitle: 'From daily labour reports, by project and contractor.',
        rows: (labour?.rows || []).filter(r => Number(r[b]?.count) > 0 || Number(r[b]?.amount) > 0),
        searchKeys: ['project_name', 'contractor_name'],
        columns: [
          projectCol,
          { key: 'contractor_name', label: 'Contractor', render: r => r.contractor_name || '—' },
          { key: 'days', label: 'Days', align: 'right', className: 'text-gray-500' },
          ...(b === 'total' ? [
            { key: 'sk', label: 'Skilled', align: 'right', render: r => num(r.skilled?.count), sum: r => r.skilled?.count, format: num },
            { key: 'ss', label: 'Semi', align: 'right', render: r => num(r.semi_skilled?.count), sum: r => r.semi_skilled?.count, format: num },
            { key: 'us', label: 'Unskilled', align: 'right', render: r => num(r.unskilled?.count), sum: r => r.unskilled?.count, format: num },
          ] : []),
          { key: 'count', label: 'Labour', align: 'right', render: r => num(r[b]?.count), sum: r => r[b]?.count, format: num, className: 'font-medium' },
          { key: 'amount', label: 'Amount', align: 'right', render: r => fmt(r[b]?.amount), sum: r => r[b]?.amount, format: fmt, className: 'text-gray-900 font-semibold' },
        ],
        fullPageHref: '/finance-board?tab=labour', fullPageLabel: 'Open Finance Board › Labour Payments',
      };
    }
    if (kind.startsWith('sales:')) {
      const cat = kind.slice(6);
      return {
        title: `${SALES_LABELS[cat]} · ${periodLabel} — ${num(laps?.[cat])}`,
        subtitle: 'The leads behind this figure.',
        rows: salesRows.category === cat ? salesRows.rows : [],
        loading: salesRows.loading || salesRows.category !== cat,
        searchKeys: ['name', 'phone', 'source', 'assigned_to_name', 'current_stage_name'],
        columns: [
          { key: 'when', label: 'Date', render: r => fmtDate(r.when), className: 'text-gray-500 whitespace-nowrap' },
          { key: 'name', label: 'Name', className: 'font-medium text-gray-900' },
          { key: 'phone', label: 'Phone', className: 'text-gray-500' },
          { key: 'source', label: 'Source', render: r => r.source || '—', className: 'text-gray-500' },
          { key: 'current_stage_name', label: 'Current stage', render: r => r.current_stage_name || '—' },
          { key: 'assigned_to_name', label: 'Assigned to', render: r => r.assigned_to_name || '—', className: 'text-gray-500' },
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
        title: `${{ total: 'All projects', new: 'New projects', ongoing: 'Ongoing projects', completed: 'Completed projects' }[st]} — ${list.length}`,
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
        title: `${{ total: 'All employees', present: 'Present', absent: 'Absent' }[which]} — ${staff.length}`,
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
              <span className={`inline-flex text-xs font-semibold border px-2 py-0.5 rounded-full capitalize ${statusCls[r.attendance_status] || 'text-red-700 bg-red-50 border-red-200'}`}>
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

  // Before the first load finishes there is nothing to show; after that a
  // refetch keeps the previous figures on screen, slightly faded.
  const v = (x) => (loadedOnce ? x : '—');
  const balance = Number(s.net_balance) || 0;
  const labourRows = labour?.rows || [];
  const labourProjects = new Set(labourRows.map(r => r.project_id)).size;
  const hasCashflow = cashflow.data.some(d => d.income || d.expense);
  const funnel = [
    { key: 'leads', label: 'Leads' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'proposals', label: 'Proposals' },
    { key: 'sales', label: 'Sales' },
  ].map((st, i, arr) => {
    const value = Number(laps?.[st.key]) || 0;
    const prev = i > 0 ? Number(laps?.[arr[i - 1].key]) || 0 : 0;
    return { ...st, value, display: num(value), color: t.ordinal4[i], note: i > 0 && prev > 0 ? `${Math.round((value / prev) * 100)}% of ${arr[i - 1].label.toLowerCase()}` : null };
  });
  const sortHeader = (key, label, align = 'right') => (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => setProjSort(p => ({ key, dir: p.key === key ? -p.dir : (key === 'project_name' ? 1 : -1) }))}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-900 ${projSort.key === key ? 'text-gray-900' : ''}`}
        data-testid={`dashboard-projects-sort-${key}`}
      >
        {label}<ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </th>
  );
  const snapshotRows = showAllProjects ? sortedSnapshot : sortedSnapshot.slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="super-admin-dashboard-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
        {/* ── Title + filter row: one row above everything it scopes ── */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900" data-testid="dashboard-title">Executive dashboard</h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1">
              Company-wide performance for {periodLabel}. Click any figure or chart for the details behind it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-date-filter">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              {[
                { k: 'today', label: 'Today' },
                { k: 'yesterday', label: 'Yesterday' },
                { k: 'week', label: 'This week' },
                { k: 'month', label: 'This month' },
              ].map(p => (
                <button
                  key={p.k}
                  onClick={() => applyPreset(p.k)}
                  data-testid={`dashboard-preset-${p.k}`}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    preset === p.k ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={`inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 shadow-sm ${preset === 'custom' ? 'border-amber-500' : 'border-gray-200'}`}>
              <Calendar className="h-4 w-4 text-gray-400" />
              <input type="date" value={range.start} max={range.end} onChange={(e) => applyCustomDate('start', e.target.value)} className="text-sm border-0 p-0 focus:outline-none focus:ring-0 bg-transparent text-gray-700" data-testid="dashboard-custom-start" aria-label="From date" />
              <span className="text-gray-400">–</span>
              <input type="date" value={range.end} min={range.start} onChange={(e) => applyCustomDate('end', e.target.value)} className="text-sm border-0 p-0 focus:outline-none focus:ring-0 bg-transparent text-gray-700" data-testid="dashboard-custom-end" aria-label="To date" />
            </div>
            <button
              onClick={fetchAll}
              disabled={dLoading}
              data-testid="dashboard-refresh"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${dLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <div className={`space-y-6 transition-opacity ${dLoading && loadedOnce ? 'opacity-60' : ''}`}>
          {/* ── KPI row ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4" data-testid="dashboard-kpis">
            <KpiTile label="Income" icon={ArrowDownLeft} value={v(inrCompact(s.total_income))} sub={`${fmt(s.total_income)} · ${incomeRows.length} receipts`} onClick={() => open('income')} testId="dashboard-metric-income" />
            <KpiTile label="Expense" icon={ArrowUpRight} value={v(inrCompact(s.total_expense))} sub={`${fmt(s.total_expense)} · ${expenseRows.length} payments`} onClick={() => open('expense')} testId="dashboard-metric-expense" />
            <KpiTile
              label="Net balance" icon={Scale} value={v(inrCompact(balance))}
              badge={loadedOnce && <StatusBadge good={balance >= 0} icon={balance >= 0 ? TrendingUp : TrendingDown}>{balance >= 0 ? 'Surplus' : 'Deficit'}</StatusBadge>}
              sub="Income less expense" onClick={() => open('balance')} testId="dashboard-metric-balance"
            />
            <KpiTile label="Receivable" icon={HandCoins} value={v(inrCompact(s.receivable))} sub="Grand total less income" onClick={() => open('receivable')} testId="dashboard-metric-receivable" />
            <KpiTile label="Material stock" icon={Package} value={v(inrCompact(materials.total_value))} sub={`${materials.projects_with_stock} projects holding stock`} onClick={() => open('mat_total')} testId="dashboard-metric-mat-total" />
            <KpiTile label="Labour cost" icon={HardHat} value={v(inrCompact(labour?.total?.amount))} sub={`${num(labour?.total?.count)} labour · ${labourProjects} projects`} onClick={() => open('labour:total')} testId="dashboard-metric-labour-total" />
          </div>

          {/* ── Cash flow trend + expense mix ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard
              className="xl:col-span-2"
              title="Cash flow"
              subtitle={`Income vs expense per ${cashflow.monthly ? 'month' : 'day'} · click a bar for its entries`}
              legend={<Legend items={[{ label: 'Income', color: t.income }, { label: 'Expense', color: t.expense }]} />}
              onViewData={() => open('income')}
              testId="dashboard-chart-cashflow"
            >
              {hasCashflow ? (
                <TrendColumns
                  data={cashflow.data}
                  series={[{ key: 'income', label: 'Income', color: t.income }, { key: 'expense', label: 'Expense', color: t.expense }]}
                  onBarClick={(seriesKey, b) => b && open(seriesKey, '', { start: b.start, end: b.end, label: b.start === b.end ? fmtDate(b.start) : b.label })}
                />
              ) : (
                <p className="h-[300px] flex items-center justify-center text-sm text-gray-400">No income or expense recorded in this period.</p>
              )}
            </ChartCard>

            <ChartCard
              title="Expense by type"
              subtitle={`${fmt(s.total_expense)} across ${expenseRows.length} payments`}
              onViewData={() => open('expense')}
              testId="dashboard-chart-expense-mix"
            >
              {expenseRows.length ? (
                <HBars
                  data={EXPENSE_CATS.map(c => ({ key: c.key, label: c.label, value: expenseByCat[c.key] })).sort((a, b) => b.value - a.value)}
                  series={[{ key: 'value', label: 'Expense', color: t.expense }]}
                  valueLabels
                  labelWidth={92}
                  rowHeight={64}
                  onBarClick={(entry) => entry?.key && open('expense', entry.key)}
                />
              ) : (
                <p className="h-[220px] flex items-center justify-center text-sm text-gray-400">No expenses in this period.</p>
              )}
            </ChartCard>
          </div>

          {/* ── Projects: income vs expense + material stock ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Top projects by money moved"
              subtitle="Income vs expense in the period · click a bar to open the project"
              legend={<Legend items={[{ label: 'Income', color: t.income }, { label: 'Expense', color: t.expense }]} />}
              onViewData={() => open('balance')}
              testId="dashboard-chart-top-projects"
            >
              {topProjects.length ? (
                <HBars
                  data={topProjects}
                  series={[{ key: 'income', label: 'Income', color: t.income }, { key: 'expense', label: 'Expense', color: t.expense }]}
                  labelWidth={180}
                  onBarClick={goProject}
                />
              ) : (
                <p className="h-[200px] flex items-center justify-center text-sm text-gray-400">No project income or expense in this period.</p>
              )}
            </ChartCard>

            <ChartCard
              title="Material stock by project"
              subtitle={`${fmt(materials.total_value)} held · inward ${inrCompact(materials.today_in)} · outward ${inrCompact(materials.today_out)}`}
              onViewData={() => open('mat_total')}
              testId="dashboard-chart-material"
            >
              {stockByProject.length ? (
                <HBars
                  data={stockByProject}
                  series={[{ key: 'stock', label: 'Stock value', color: t.material }]}
                  valueLabels
                  labelWidth={180}
                  onBarClick={goProject}
                />
              ) : (
                <p className="h-[200px] flex items-center justify-center text-sm text-gray-400">No material stock recorded.</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => open('mat_in')} className="rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50" data-testid="dashboard-metric-mat-in">
                  <p className="text-sm text-gray-500">Material inward</p>
                  <p className="text-lg font-semibold text-gray-900">{v(fmt(materials.today_in))}</p>
                  <p className="text-xs text-gray-500">{materials.lines_in} lines received</p>
                </button>
                <button type="button" onClick={() => open('mat_out')} className="rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50" data-testid="dashboard-metric-mat-out">
                  <p className="text-sm text-gray-500">Material outward</p>
                  <p className="text-lg font-semibold text-gray-900">{v(fmt(materials.today_out))}</p>
                  <p className="text-xs text-gray-500">{materials.lines_out} lines used</p>
                </button>
              </div>
            </ChartCard>
          </div>

          {/* ── Sales funnel · Labour mix · Workforce & projects ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard
              title="Sales funnel"
              subtitle="Leads to deal close in the period · click a stage for its leads"
              onViewData={() => open('sales:leads')}
              testId="dashboard-chart-funnel"
            >
              <RankRows rows={funnel} onRowClick={(r) => open(`sales:${r.key}`)} testId="dashboard-metric-sales" />
              <Link to="/sales-board" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">Open Sales Board <ChevronRight className="h-4 w-4" /></Link>
            </ChartCard>

            <ChartCard
              title="Labour by skill"
              subtitle={`${num(labour?.total?.count)} labour · ${fmt(labour?.total?.amount)} · ${labourRows.length} contractor sites`}
              onViewData={() => open('labour:total')}
              testId="dashboard-chart-labour"
            >
              <RankRows
                rows={['skilled', 'semi_skilled', 'unskilled'].map((k, i) => ({
                  key: k,
                  label: LABOUR_BUCKETS[k],
                  value: Number(labour?.[k]?.amount) || 0,
                  display: `${num(labour?.[k]?.count)} · ${fmt(labour?.[k]?.amount)}`,
                  color: t.ordinal3[2 - i],
                }))}
                onRowClick={(r) => open(`labour:${r.key}`)}
                testId="dashboard-metric-labour"
              />
              <Link to="/finance-board?tab=labour" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">Open Labour Payments <ChevronRight className="h-4 w-4" /></Link>
            </ChartCard>

            <ChartCard title="Workforce & projects" subtitle={`Attendance on ${fmtDate(hr?.date || range.end)} · project status today`} testId="dashboard-chart-workforce">
              <div className="space-y-6">
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <button type="button" onClick={() => open('hr:total')} className="text-sm font-medium text-gray-700 hover:underline decoration-dotted underline-offset-4" data-testid="dashboard-metric-hr-total">
                      {num(hr?.total_staff)} employees
                    </button>
                    <span className="text-sm text-gray-500">
                      <button type="button" onClick={() => open('hr:present')} className="font-semibold text-gray-900 hover:underline decoration-dotted underline-offset-4" data-testid="dashboard-metric-hr-present">{num(hr?.present)}</button> present ·{' '}
                      <button type="button" onClick={() => open('hr:absent')} className="font-semibold text-gray-900 hover:underline decoration-dotted underline-offset-4" data-testid="dashboard-metric-hr-absent">{num(hr?.absent)}</button> absent
                      {hr?.wfh ? ` · ${hr.wfh} WFH` : ''}
                    </span>
                  </div>
                  <Meter value={hr?.present || 0} total={hr?.total_staff || 0} label="attendance" onClick={() => open('hr:present')} testId="dashboard-meter-attendance" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <button type="button" onClick={() => open('proj:total')} className="text-sm font-medium text-gray-700 hover:underline decoration-dotted underline-offset-4" data-testid="dashboard-metric-proj-total">
                      {num(projectsOverview?.total)} live projects
                    </button>
                    <Link to="/planning-board" className="text-sm font-medium text-amber-700 hover:text-amber-800">Planning Board</Link>
                  </div>
                  <ShareBar
                    segments={[
                      { key: 'new', label: 'New', value: projectsOverview?.new || 0, color: t.ordinal3[0] },
                      { key: 'ongoing', label: 'Ongoing', value: projectsOverview?.ongoing || 0, color: t.ordinal3[1] },
                      { key: 'completed', label: 'Completed', value: projectsOverview?.completed || 0, color: t.ordinal3[2] },
                    ]}
                    onSegmentClick={(seg) => open(`proj:${seg.key}`)}
                    testId="dashboard-metric-proj"
                  />
                </div>
              </div>
            </ChartCard>
          </div>

          {/* ── Project value bridge ── */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-5" data-testid="dashboard-card-project-values">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Project value</h3>
                <p className="text-sm text-gray-500 mt-0.5">All live projects · Scope + Additions − Deductions = Grand total</p>
              </div>
              <Link to="/finance-board?tab=projects" className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">Finance Board › Project Wise <ChevronRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-3">
              {[
                { k: 'scope_value', label: 'Scope value', value: s.scope_value },
                { op: '+' },
                { k: 'additions', label: 'Additions', value: s.additions_total },
                { op: '−' },
                { k: 'deductions', label: 'Deductions', value: s.deductions_total },
                { op: '=' },
                { k: 'grand_total', label: 'Grand total', value: s.grand_total_value, strong: true },
              ].map((x, i) => (x.op ? (
                <span key={i} className="hidden lg:block text-2xl font-light text-gray-400 text-center">{x.op}</span>
              ) : (
                <button
                  key={x.k}
                  type="button"
                  onClick={() => open(x.k)}
                  title={fmt(x.value)}
                  data-testid={`dashboard-metric-${x.k.replace('_value', '').replace('_', '-')}`}
                  className={`rounded-lg border px-4 py-3 text-left hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${x.strong ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}
                >
                  <p className="text-sm text-gray-500">{x.label}</p>
                  <p className="text-xl font-semibold text-gray-900 mt-0.5">{v(inrCompact(x.value))}</p>
                  <p className="text-xs text-gray-500 mt-0.5 tabular-nums">{v(fmt(x.value))}</p>
                </button>
              )))}
            </div>
          </section>

          {/* ── Project-by-project table ── */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="dashboard-card-project-snapshot">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Projects in this period</h3>
                <p className="text-sm text-gray-500 mt-0.5">{projectSnapshot.length} with activity · sort by any column · click a row to open the project</p>
              </div>
              <Link to="/finance-board?tab=projects" className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800" data-testid="dashboard-link-project-wise">
                Finance Board › Project Wise <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]" data-testid="dashboard-projects-table">
                <thead className="bg-gray-50 border-y border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                    {sortHeader('project_name', 'Project', 'left')}
                    {sortHeader('income', 'Income')}
                    {sortHeader('expense', 'Expense')}
                    {sortHeader('balance', 'Balance')}
                    {sortHeader('labour', 'Labour')}
                    {sortHeader('stock', 'Material stock')}
                    {sortHeader('receivable', 'Receivable')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!loadedOnce ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
                  ) : snapshotRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No project activity in this period.</td></tr>
                  ) : snapshotRows.map((p, idx) => (
                    <tr key={p.project_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => goProject(p)} data-testid={`dashboard-projects-row-${idx}`}>
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.project_name}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(p.income)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(p.expense)}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${p.balance < 0 ? 'text-red-700' : 'text-gray-900'}`}>{fmt(p.balance)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(p.labour)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(p.stock)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(p.receivable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedSnapshot.length > 10 && (
              <div className="px-5 py-3 border-t border-gray-200 text-center">
                <button type="button" onClick={() => setShowAllProjects(x => !x)} className="text-sm font-medium text-amber-700 hover:text-amber-800" data-testid="dashboard-projects-toggle">
                  {showAllProjects ? 'Show top 10' : `Show all ${sortedSnapshot.length} projects`}
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      {dialogProps && (
        <DashboardDetailDialog
          key={`${detail.kind}-${detail.chip}-${detail.period?.start || ''}`}
          open={!!detail}
          onOpenChange={(o) => { if (!o) setDetail(null); }}
          {...dialogProps}
        />
      )}
      <MobileBottomNav user={user} />
    </div>
  );
}
