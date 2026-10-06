import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Table2 } from 'lucide-react';
import { useChartTheme, inr, inrCompact } from './chartTheme';

/* Oct 6 2026 — building blocks for the analytical Super Admin Dashboard.
 * Mark specs follow the data-viz method: bars <= 24px with a 4px rounded
 * data end and a square baseline, 2px gaps between neighbouring bars,
 * solid hairline grid, values in ink (never the series colour), a legend
 * for two or more series, a hover tooltip on every mark, and a table view
 * ("View data") behind every chart. */

// ── Card shell ─────────────────────────────────────────────────────────
export function ChartCard({ title, subtitle, onViewData, legend, children, className = '', testId, bodyClassName = '' }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col ${className}`} data-testid={testId}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {onViewData && (
          <button
            type="button"
            onClick={onViewData}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            data-testid={testId ? `${testId}-view-data` : undefined}
          >
            <Table2 className="h-4 w-4" /> View data
          </button>
        )}
      </header>
      {legend && <div className="px-5 pt-3">{legend}</div>}
      <div className={`px-5 pb-5 pt-3 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

// Legend mirrors the mark: a rounded rect for bars.
export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map(it => (
        <span key={it.label} className="inline-flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Values lead, labels follow; a short line key per series.
export function ChartTooltip({ active, payload, label, valueFormatter = inr, labelFormatter, hint }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm min-w-[160px]">
      <p className="text-xs text-gray-500 mb-1">{labelFormatter ? labelFormatter(label, payload) : label}</p>
      {payload.map(p => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2 py-0.5">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: p.color || p.fill || p.payload?.fill }} />
          <span className="font-semibold text-gray-900 tabular-nums">{valueFormatter(p.value)}</span>
          <span className="text-gray-500">{p.name}</span>
        </div>
      ))}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────
export function KpiTile({ label, value, sub, icon: Icon, badge, onClick, testId, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={`View ${label} details`}
      className="group text-left rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {Icon && <Icon className="h-5 w-5 text-gray-400 group-hover:text-amber-600" />}
      </div>
      <div className={`mt-2 text-[28px] leading-9 font-semibold text-gray-900 ${loading ? 'opacity-60' : ''}`}>{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        {badge}
        <span className="truncate">{sub}</span>
      </div>
    </button>
  );
}

// Good / bad state always travels with an icon and a word, never colour alone.
export function StatusBadge({ good, icon: Icon, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
      good ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'
    }`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}{children}
    </span>
  );
}

// ── Column chart: two series over time ────────────────────────────────
export function TrendColumns({ data, series, onBarClick, height = 300 }) {
  const t = useChartTheme();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: t.axis }} tick={{ fill: t.muted, fontSize: 12 }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: t.muted, fontSize: 12 }} tickFormatter={inrCompact} width={72} />
          <Tooltip cursor={{ fill: t.hover }} content={<ChartTooltip hint={onBarClick ? 'Click a bar for its entries' : undefined} />} />
          {series.map(s => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={onBarClick ? (entry) => onBarClick(s.key, entry?.payload || entry) : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Horizontal bars: one or two series per row ────────────────────────
const truncate = (s, n = 22) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

// One-line category label, shortened to fit the label column (recharts'
// default tick wraps long project names onto two lines).
function CategoryTick({ x, y, payload, width, fill }) {
  const maxChars = Math.max(6, Math.floor((width - 8) / 7.2));
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={fill} fontSize={13}>
      <title>{payload?.value}</title>
      {truncate(String(payload?.value ?? ''), maxChars)}
    </text>
  );
}

export function HBars({ data, series, onBarClick, valueLabels = false, labelWidth = 150, rowHeight }) {
  const t = useChartTheme();
  const perRow = rowHeight || (series.length > 1 ? 44 : 34);
  const height = Math.max(120, data.length * perRow + 16);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" barGap={2} barCategoryGap={series.length > 1 ? '18%' : '28%'} margin={{ top: 4, right: valueLabels ? 72 : 12, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: t.muted, fontSize: 12 }} tickFormatter={inrCompact} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={{ stroke: t.axis }} width={labelWidth} tick={<CategoryTick width={labelWidth} fill={t.ink2} />} interval={0} />
          <Tooltip cursor={{ fill: t.hover }} content={<ChartTooltip hint={onBarClick ? 'Click to open' : undefined} />} />
          {series.map(s => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[0, 4, 4, 0]}
              maxBarSize={series.length > 1 ? 14 : 20}
              isAnimationActive={false}
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={onBarClick ? (entry) => onBarClick(entry?.payload || entry, s.key) : undefined}
            >
              {valueLabels && <LabelList dataKey={s.key} position="right" formatter={inrCompact} fill={t.ink2} fontSize={12} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Ranked rows (funnel, skill tiers): ordered stages, ordinal ramp ───
// rows: [{ key, label, value, display, note, color }]
export function RankRows({ rows, onRowClick, testId }) {
  const max = Math.max(1, ...rows.map(r => Number(r.value) || 0));
  return (
    <div className="space-y-3" data-testid={testId}>
      {rows.map(r => (
        <button
          key={r.key}
          type="button"
          onClick={() => onRowClick?.(r)}
          className="group w-full text-left rounded-md -mx-1 px-1 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          title={`View ${r.label} details`}
          data-testid={testId ? `${testId}-${r.key}` : undefined}
        >
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-gray-700">{r.label}</span>
            <span className="text-gray-900 font-semibold tabular-nums group-hover:underline decoration-dotted underline-offset-4">{r.display}</span>
          </div>
          <div className="mt-1.5 h-3 w-full rounded-sm bg-gray-100 overflow-hidden">
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (Number(r.value) || 0) / max * 100)}%`, background: r.color }} />
          </div>
          {r.note && <p className="mt-1 text-xs text-gray-500">{r.note}</p>}
        </button>
      ))}
    </div>
  );
}

// ── Meter: one ratio against its whole, track = lighter step of the ramp ─
export function Meter({ value, total, onClick, label, testId }) {
  const t = useChartTheme();
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <button type="button" onClick={onClick} className="group w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md" data-testid={testId} title={`View ${label}`}>
      <div className="h-3 w-full rounded-sm overflow-hidden" style={{ background: t.meterTrack }}>
        <div className="h-full rounded-r-[4px]" style={{ width: `${pct}%`, background: t.meterFill }} />
      </div>
      <p className="mt-1.5 text-sm text-gray-500"><span className="font-semibold text-gray-900 group-hover:underline decoration-dotted underline-offset-4">{Math.round(pct)}%</span> {label}</p>
    </button>
  );
}

// ── Share bar: part-to-whole, 2px surface gaps between segments ───────
// segments: [{ key, label, value, color }]
export function ShareBar({ segments, onSegmentClick, testId }) {
  const t = useChartTheme();
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  return (
    <div data-testid={testId}>
      <div className="flex h-3 w-full rounded-sm overflow-hidden" style={{ gap: 2, background: t.surface }}>
        {total === 0 ? <div className="flex-1 bg-gray-100" /> : segments.filter(s => s.value > 0).map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSegmentClick?.(s)}
            className="h-full first:rounded-l-sm last:rounded-r-[4px] hover:opacity-80 focus:outline-none"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value}`}
            aria-label={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(s => (
          <button key={s.key} type="button" onClick={() => onSegmentClick?.(s)} className="group inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900" data-testid={testId ? `${testId}-${s.key}` : undefined}>
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold text-gray-900 tabular-nums group-hover:underline decoration-dotted underline-offset-4">{s.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
