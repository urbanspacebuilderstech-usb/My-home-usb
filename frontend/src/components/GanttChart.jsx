import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';

const STATUS_COLORS = {
  yet_to_start: { bar: 'bg-slate-300', text: 'text-slate-700', border: 'border-slate-400' },
  started: { bar: 'bg-amber-400', text: 'text-amber-800', border: 'border-amber-500' },
  finished: { bar: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-600' },
};

const STATUS_LABELS = {
  yet_to_start: 'Yet to Start',
  started: 'In Progress',
  finished: 'Finished',
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function formatDate(d) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatMonthYear(d) {
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export default function GanttChart({ stages }) {
  const scrollRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1); // 0=week, 1=2week, 2=month

  const dayWidth = [28, 18, 10][zoomLevel] || 18;
  const ROW_HEIGHT = 44;
  const LABEL_WIDTH = 180;

  // Compute timeline bounds
  const { timelineStart, timelineEnd, validStages } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const valid = stages
      .filter(s => s.start_date || s.target_date)
      .map(s => {
        const start = s.start_date ? new Date(s.start_date) : (s.target_date ? addDays(new Date(s.target_date), -14) : now);
        const end = s.target_date ? new Date(s.target_date) : addDays(start, 14);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        // Ensure at least 1 day span
        if (end <= start) end.setDate(start.getDate() + 1);
        return { ...s, _start: start, _end: end };
      });

    if (valid.length === 0) {
      return { timelineStart: now, timelineEnd: addDays(now, 60), validStages: [] };
    }

    let minDate = new Date(Math.min(...valid.map(s => s._start.getTime())));
    let maxDate = new Date(Math.max(...valid.map(s => s._end.getTime())));

    // Pad timeline
    minDate = addDays(minDate, -7);
    maxDate = addDays(maxDate, 14);

    return { timelineStart: minDate, timelineEnd: maxDate, validStages: valid };
  }, [stages]);

  const totalDays = diffDays(timelineStart, timelineEnd);
  const totalWidth = totalDays * dayWidth;

  // Generate column headers
  const headers = useMemo(() => {
    const months = [];
    const days = [];
    let cursor = new Date(timelineStart);

    // Month headers
    while (cursor <= timelineEnd) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const endDate = monthEnd > timelineEnd ? timelineEnd : monthEnd;
      const span = diffDays(monthStart, endDate) + 1;
      months.push({ label: formatMonthYear(monthStart), width: span * dayWidth });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // Day/week markers
    cursor = new Date(timelineStart);
    while (cursor <= timelineEnd) {
      const isWeekStart = cursor.getDay() === 1;
      const isToday =
        cursor.toDateString() === new Date().toDateString();
      days.push({
        date: new Date(cursor),
        label: cursor.getDate(),
        isWeekStart,
        isToday,
      });
      cursor = addDays(cursor, 1);
    }

    return { months, days };
  }, [timelineStart, timelineEnd, dayWidth]);

  // Today marker position
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(timelineStart, today) * dayWidth;
  const showTodayLine = today >= timelineStart && today <= timelineEnd;

  const scrollToToday = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 200);
    }
  };

  if (validStages.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400" data-testid="gantt-empty">
        <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="font-medium text-sm">No timeline data</p>
        <p className="text-xs mt-1">Add start & target dates to stages to see the Gantt chart</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white" data-testid="gantt-chart">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoomLevel(z => Math.max(0, z - 1))} disabled={zoomLevel === 0}>
            <ZoomIn className="h-3 w-3 mr-1" />Zoom In
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoomLevel(z => Math.min(2, z + 1))} disabled={zoomLevel === 2}>
            <ZoomOut className="h-3 w-3 mr-1" />Zoom Out
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={scrollToToday}>
          <CalendarDays className="h-3 w-3 mr-1" />Today
        </Button>
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${STATUS_COLORS[key].bar}`} />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Left: Stage labels (fixed) */}
        <div className="flex-shrink-0 border-r bg-gray-50" style={{ width: LABEL_WIDTH }}>
          {/* Header spacer */}
          <div className="h-[52px] border-b flex items-end px-3 pb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase">Stage</span>
          </div>
          {validStages.map((s, i) => (
            <div
              key={s.stage_id}
              className="flex items-center px-3 border-b"
              style={{ height: ROW_HEIGHT }}
            >
              <div className="truncate">
                <p className="text-xs font-medium truncate" title={s.stage_name}>{s.stage_name}</p>
                <p className="text-[10px] text-gray-400">
                  {formatDate(s._start)} - {formatDate(s._end)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Timeline (scrollable) */}
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* Month + Day headers */}
            <div className="border-b" style={{ height: 52 }}>
              {/* Month row */}
              <div className="flex h-[26px]">
                {headers.months.map((m, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 border-r border-b text-[10px] font-semibold text-gray-600 flex items-center justify-center bg-gray-50"
                    style={{ width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Day row */}
              <div className="flex h-[26px]">
                {headers.days.map((d, i) => (
                  <div
                    key={i}
                    className={`flex-shrink-0 text-[9px] flex items-center justify-center border-r ${
                      d.isToday ? 'bg-blue-100 font-bold text-blue-700' : d.isWeekStart ? 'bg-gray-100 font-medium text-gray-600' : 'text-gray-400'
                    }`}
                    style={{ width: dayWidth }}
                  >
                    {dayWidth >= 14 ? d.label : (d.isWeekStart || d.isToday ? d.label : '')}
                  </div>
                ))}
              </div>
            </div>

            {/* Bars */}
            <div className="relative">
              {/* Today line */}
              {showTodayLine && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-blue-500 z-10"
                  style={{ left: todayOffset + dayWidth / 2 }}
                >
                  <div className="absolute -top-0 -translate-x-1/2 bg-blue-500 text-white text-[8px] px-1 rounded-b font-bold">
                    TODAY
                  </div>
                </div>
              )}

              {/* Weekend stripes */}
              {headers.days.map((d, i) => {
                const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
                return isWeekend ? (
                  <div
                    key={`bg-${i}`}
                    className="absolute top-0 bg-gray-50/70"
                    style={{ left: i * dayWidth, width: dayWidth, height: validStages.length * ROW_HEIGHT }}
                  />
                ) : null;
              })}

              {validStages.map((s, rowIdx) => {
                const offsetDays = diffDays(timelineStart, s._start);
                const spanDays = Math.max(1, diffDays(s._start, s._end));
                const left = offsetDays * dayWidth;
                const width = spanDays * dayWidth;
                const colors = STATUS_COLORS[s.status] || STATUS_COLORS.yet_to_start;
                const daysTotal = diffDays(s._start, s._end);
                const daysElapsed = s.status === 'finished' ? daysTotal : Math.max(0, diffDays(s._start, today));
                const progress = daysTotal > 0 ? Math.min(100, Math.round((daysElapsed / daysTotal) * 100)) : 0;

                return (
                  <div
                    key={s.stage_id}
                    className="relative border-b"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Bar */}
                    <div
                      className={`absolute top-2 rounded-md border ${colors.bar} ${colors.border} shadow-sm cursor-default group transition-all hover:shadow-md`}
                      style={{
                        left,
                        width: Math.max(width, dayWidth),
                        height: ROW_HEIGHT - 16,
                      }}
                      data-testid={`gantt-bar-${s.stage_id}`}
                    >
                      {/* Progress fill for started items */}
                      {s.status === 'started' && progress > 0 && (
                        <div
                          className="absolute inset-0 rounded-md bg-amber-500/30"
                          style={{ width: `${progress}%` }}
                        />
                      )}
                      {/* Label on bar */}
                      {width > 60 && (
                        <span className={`absolute inset-0 flex items-center px-2 text-[10px] font-medium truncate ${colors.text}`}>
                          {s.stage_name}
                        </span>
                      )}

                      {/* Tooltip */}
                      <div className="hidden group-hover:block absolute z-20 bottom-full left-0 mb-1 bg-gray-900 text-white text-[10px] rounded px-2 py-1.5 whitespace-nowrap shadow-lg">
                        <p className="font-semibold">{s.stage_name}</p>
                        <p>{formatDate(s._start)} → {formatDate(s._end)} ({daysTotal} days)</p>
                        <p>Status: {STATUS_LABELS[s.status] || s.status}</p>
                        {s.remarks && <p className="text-gray-300 mt-0.5">{s.remarks}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
