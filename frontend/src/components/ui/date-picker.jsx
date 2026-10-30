import * as React from "react"
import { CalendarDays } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Date-only picker in the ERP theme — the amber DayPicker the Cashbook / Sr SE
// date filters use (the browser's own date/time popup is blue and can't be
// styled). `value`, `min` and what `onChange` receives are "YYYY-MM-DD"
// strings, read as LOCAL dates so a picked day never shifts by one around
// midnight the way new Date("YYYY-MM-DD") (UTC) would.
const toDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "")
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}
const toValue = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const label = (d) =>
  `${d.toLocaleDateString("en-IN", { weekday: "short" })}, ${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`

function DatePicker({ value, onChange, min, disabled, placeholder = "Select date", className, ...props }) {
  const [open, setOpen] = React.useState(false)
  const selected = toDate(value)
  const minDate = toDate(min)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50",
            selected ? "text-gray-900" : "text-muted-foreground",
            className
          )}
          {...props}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-amber-600" />
          {selected ? label(selected) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected || minDate}
          onSelect={(d) => {
            if (!d) return
            onChange(toValue(d))
            setOpen(false)
          }}
          disabled={minDate ? { before: minDate } : undefined}
          // App.js loads react-day-picker/dist/style.css, whose
          // .rdp-button_reset (background:none; color:inherit) beats plain
          // Tailwind colours and whose hover/focus use its own blue. Point its
          // variables at amber, drop its 1em margin, and force the day colours.
          className="!m-0"
          style={{ "--rdp-accent-color": "#d97706", "--rdp-background-color": "#fffbeb" }}
          classNames={{
            months: "flex gap-4", month: "space-y-3",
            caption: "flex justify-center relative items-center h-8",
            caption_label: "text-sm font-semibold text-gray-800",
            nav: "flex items-center gap-1",
            nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-lg hover:bg-gray-100",
            table: "w-full border-collapse", head_row: "flex",
            head_cell: "text-gray-400 rounded-md w-8 font-normal text-[10px] uppercase",
            row: "flex w-full mt-1", cell: "relative p-0 text-center text-sm",
            // aria-selected variants come after plain utilities in the CSS,
            // so a selected today is amber-on-white, not amber-on-amber.
            day: "h-8 w-8 p-0 font-normal text-xs rounded-lg transition-colors inline-flex items-center justify-center aria-selected:!bg-amber-600 aria-selected:!text-white aria-selected:font-medium",
            day_today: "!bg-gray-100 font-semibold !text-amber-600",
            day_outside: "text-gray-300",
            day_disabled: "cursor-not-allowed",
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker, toValue as toDateValue }
