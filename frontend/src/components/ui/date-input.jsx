import * as React from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, useDayPicker, useNavigation } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Nov 11 2026 — drop-in replacement for <input type="date" | "month" |
// "datetime-local">. The browser's own calendar popup is blue and cannot be
// styled, so this shows the ERP's amber calendar instead.
//
// It behaves like the native input for the code around it:
//  • value / defaultValue / min / max use the same strings
//    ("YYYY-MM-DD", "YYYY-MM", "YYYY-MM-DDTHH:mm"), read as LOCAL dates.
//  • A hidden real <input> carries name / required / ref / onChange / onBlur.
//    Picking a date sets its value and fires a real input event, so
//    `onChange={(e) => …e.target.value}` and `defaultValue` + `onBlur` keep
//    working, and `required` still blocks the form submit.
//  • className / id / data-testid / disabled go on the visible button.
// `bare` drops the shadcn Input box styles, for plain <input> call sites
// that bring their own border / padding classes.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const pad = (n) => String(n).padStart(2, "0")
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "")
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined
}
const parseMonth = (s) => {
  const m = /^(\d{4})-(\d{2})/.exec(s || "")
  return m ? new Date(+m[1], +m[2] - 1, 1) : undefined
}
const dayValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const timeOf = (s) => (/T(\d{2}:\d{2})/.exec(s || "") || [])[1] || ""
const fmtDay = (d) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
const fmtTime = (t) => {
  const [h, m] = t.split(":").map(Number)
  return `${pad(((h + 11) % 12) + 1)}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`
}
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

function displayText(type, v) {
  if (type === "month") {
    const d = parseMonth(v)
    return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ""
  }
  const d = parseDay(v)
  if (!d) return ""
  const t = type === "datetime-local" ? timeOf(v) : ""
  return t ? `${fmtDay(d)}, ${fmtTime(t)}` : fmtDay(d)
}

// Amber day grid shared by every ERP calendar. App loads
// react-day-picker/dist/style.css, whose .rdp-button_reset clears plain
// Tailwind backgrounds, so the selected day keeps rdp's own class and forces
// the colours; the CSS variables turn rdp's blue hover / focus amber.
export const erpCalendarStyle = {
  "--rdp-cell-size": "36px",
  "--rdp-accent-color": "#d97706",
  "--rdp-background-color": "#fef3c7",
  "--rdp-outline": "2px solid #f59e0b",
  "--rdp-outline-selected": "2px solid #b45309",
}
export const erpCalendarClassNames = {
  months: "flex",
  month: "space-y-1",
  table: "w-full border-collapse",
  head_row: "flex",
  head_cell: "w-9 pb-1 text-[10px] font-medium uppercase text-gray-400",
  row: "flex w-full mt-0.5",
  cell: "relative p-0 text-center",
  day: "h-9 w-9 p-0 rounded-lg text-xs font-normal text-gray-800 inline-flex items-center justify-center transition-colors",
  day_selected: "rdp-day_selected !bg-amber-600 !text-white font-semibold",
  day_today: "font-semibold text-amber-700 ring-1 ring-inset ring-amber-300",
  day_outside: "!text-gray-300",
  day_disabled: "!text-gray-300 cursor-not-allowed",
}

const navBtn = "h-7 w-7 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-30 disabled:pointer-events-none"
const selectCls = "h-7 rounded-md border border-gray-200 bg-white px-1.5 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"

// Month / year dropdowns + arrows, so far-off dates (date of birth, old
// bills) are two clicks away instead of dozens of arrow presses.
function ErpCaption({ displayMonth }) {
  const { goToMonth, nextMonth, previousMonth } = useNavigation()
  const { fromDate, toDate } = useDayPicker()
  const fromY = fromDate ? fromDate.getFullYear() : displayMonth.getFullYear() - 50
  const toY = toDate ? toDate.getFullYear() : displayMonth.getFullYear() + 10
  const years = []
  for (let y = fromY; y <= toY; y++) years.push(y)
  const go = (y, m) => goToMonth(new Date(y, m, 1))
  return (
    <div className="flex items-center justify-between gap-1 pb-2">
      <button type="button" className={navBtn} disabled={!previousMonth} onClick={() => previousMonth && goToMonth(previousMonth)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-1">
        <select aria-label="Month" className={selectCls} value={displayMonth.getMonth()} onChange={(e) => go(displayMonth.getFullYear(), +e.target.value)}>
          {MONTHS_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select aria-label="Year" className={selectCls} value={displayMonth.getFullYear()} onChange={(e) => go(+e.target.value, displayMonth.getMonth())}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <button type="button" className={navBtn} disabled={!nextMonth} onClick={() => nextMonth && goToMonth(nextMonth)} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function MonthGrid({ selected, minM, maxM, onPick }) {
  const today = new Date()
  const [year, setYear] = React.useState((selected || today).getFullYear())
  const out = (y, m) => (minM && new Date(y, m, 1) < minM) || (maxM && new Date(y, m, 1) > maxM)
  return (
    <div className="w-60">
      <div className="flex items-center justify-between pb-2">
        <button type="button" className={navBtn} onClick={() => setYear(year - 1)} disabled={minM && year <= minM.getFullYear()} aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold text-gray-800">{year}</span>
        <button type="button" className={navBtn} onClick={() => setYear(year + 1)} disabled={maxM && year >= maxM.getFullYear()} aria-label="Next year"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((m, i) => {
          const isSel = selected && selected.getFullYear() === year && selected.getMonth() === i
          const isNow = today.getFullYear() === year && today.getMonth() === i
          return (
            <button
              key={m}
              type="button"
              disabled={out(year, i)}
              onClick={() => onPick(new Date(year, i, 1))}
              className={cn(
                "h-9 rounded-lg text-xs transition-colors disabled:cursor-not-allowed disabled:text-gray-300",
                isSel ? "bg-amber-600 font-semibold text-white" : "text-gray-800 hover:bg-amber-50 hover:text-amber-700",
                !isSel && isNow && "font-semibold text-amber-700 ring-1 ring-inset ring-amber-300"
              )}
            >
              {m}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const DateInput = React.forwardRef(function DateInput(
  {
    type = "date", value, defaultValue, onChange, onBlur, name, required, form,
    min, max, disabled, readOnly, placeholder, className, id, bare = false, ...rest
  },
  ref
) {
  const controlled = value !== undefined
  const [inner, setInner] = React.useState(defaultValue || "")
  const current = (controlled ? value : inner) || ""
  const [open, setOpen] = React.useState(false)
  const [time, setTime] = React.useState(timeOf(current) || "")
  const hiddenRef = React.useRef(null)
  const setRefs = React.useCallback((el) => {
    hiddenRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }, [ref])

  React.useEffect(() => { if (open) setTime(timeOf(current) || "") }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const isMonth = type === "month"
  const isDateTime = type === "datetime-local"
  const selected = isMonth ? parseMonth(current) : parseDay(current)
  const minD = isMonth ? parseMonth(min) : parseDay(min)
  const maxD = isMonth ? parseMonth(max) : parseDay(max)

  // Write through the hidden input exactly like typing would: the native
  // value setter + a bubbling "input" event, which React turns into onChange.
  const commit = (v, { blur = false } = {}) => {
    const el = hiddenRef.current
    if (!controlled) setInner(v)
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
      setter.call(el, v)
      el.dispatchEvent(new Event("input", { bubbles: true }))
      if (blur) el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    }
  }

  const pickDay = (d) => {
    if (!d) return
    if (isDateTime) {
      const t = time || "09:00"
      setTime(t)
      commit(`${dayValue(d)}T${t}`)
    } else {
      commit(dayValue(d), { blur: true })
      setOpen(false)
    }
  }
  const pickTime = (t) => {
    setTime(t)
    const d = selected || new Date()
    if (t) commit(`${dayValue(d)}T${t}`)
  }
  const clear = () => { commit("", { blur: true }); setOpen(false) }
  const today = () => {
    const now = new Date()
    if (isMonth) commit(monthValue(now), { blur: true })
    else if (isDateTime) commit(`${dayValue(now)}T${nowTime()}`, { blur: true })
    else commit(dayValue(now), { blur: true })
    setOpen(false)
  }
  const todayAllowed = (() => {
    const n = new Date()
    const t = isMonth ? new Date(n.getFullYear(), n.getMonth(), 1) : new Date(n.getFullYear(), n.getMonth(), n.getDate())
    return !(minD && t < minD) && !(maxD && t > maxD)
  })()

  const thisYear = new Date().getFullYear()
  const fromYear = Math.min(minD ? minD.getFullYear() : thisYear - 60, selected ? selected.getFullYear() : thisYear)
  const toYear = Math.max(maxD ? maxD.getFullYear() : thisYear + 10, selected ? selected.getFullYear() : thisYear)
  const startMonth = selected || (minD && minD > new Date() ? minD : (maxD && maxD < new Date() ? maxD : new Date()))
  const disabledDays = [minD && { before: minD }, maxD && { after: maxD }].filter(Boolean)

  const text = displayText(type, current)
  const empty = placeholder || (isMonth ? "Select month" : "Select date")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled || readOnly}
          className={cn(
            bare
              ? "inline-flex items-center gap-1.5 whitespace-nowrap text-left"
              : "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-base shadow-sm transition-colors md:text-sm",
            "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...rest}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
          <span className={cn("min-w-0 truncate", !text && "text-muted-foreground")}>{text || empty}</span>
        </button>
      </PopoverTrigger>
      {/* Carries the form value. Out of the layout flow, but not display:none,
          so a `required` field can still show the browser's "fill this in" tip. */}
      <input
        ref={setRefs}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        {...(controlled ? { value: value || "" } : { defaultValue: defaultValue || "" })}
        onChange={onChange || (() => {})}
        onBlur={onBlur}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      <PopoverContent className="w-auto p-3" align="start" collisionPadding={8} data-testid={rest["data-testid"] ? `${rest["data-testid"]}-calendar` : undefined}>
        {isMonth ? (
          <MonthGrid selected={selected} minM={minD} maxM={maxD} onPick={(d) => { commit(monthValue(d), { blur: true }); setOpen(false) }} />
        ) : (
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={pickDay}
            defaultMonth={startMonth}
            fromYear={fromYear}
            toYear={toYear}
            disabled={disabledDays.length ? disabledDays : undefined}
            showOutsideDays
            className="!m-0"
            style={erpCalendarStyle}
            classNames={erpCalendarClassNames}
            components={{ Caption: ErpCaption }}
          />
        )}
        {isDateTime && (
          <div className="mt-2 flex items-center gap-2 border-t pt-2">
            <span className="text-xs text-gray-500">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => pickTime(e.target.value)}
              className="h-8 flex-1 rounded-md border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
          {!required ? (
            <button type="button" onClick={clear} className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100">Clear</button>
          ) : <span />}
          <div className="flex items-center gap-1">
            <button type="button" onClick={today} disabled={!todayAllowed} className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40">
              {isMonth ? "This month" : isDateTime ? "Now" : "Today"}
            </button>
            {isDateTime && (
              <button
                type="button"
                onClick={() => { const el = hiddenRef.current; if (el) el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); setOpen(false) }}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})
DateInput.displayName = "DateInput"

export { DateInput }
