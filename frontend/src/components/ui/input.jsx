import * as React from "react"

import { cn } from "@/lib/utils"
import { DateInput } from "@/components/ui/date-input"

// Nov 11 2026 — date / month / date-time fields render the ERP's amber
// calendar (DateInput) instead of the browser's blue popup. Same props,
// same "YYYY-MM-DD" values, so call sites don't change.
const CALENDAR_TYPES = new Set(["date", "month", "datetime-local"])

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  if (CALENDAR_TYPES.has(type)) {
    return <DateInput ref={ref} type={type} className={className} {...props} />
  }
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
