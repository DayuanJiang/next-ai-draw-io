import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styles
        "flex h-10 w-full min-w-0 rounded-xl px-3.5 py-2",
        "border border-border-subtle bg-surface-1",
        "text-sm text-foreground",
        // Placeholder
        "placeholder:text-muted-foreground/60",
        // Selection
        "selection:bg-primary selection:text-primary-foreground",
        // Transitions
        "transition-all duration-150 ease-out",
        // Hover state
        "hover:border-border-default",
        // Focus state - refined ring
        "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10",
        // File input
        "file:text-foreground file:inline-flex file:h-7 file:border-0",
        "file:bg-transparent file:text-sm file:font-medium",
        // Disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // Invalid state
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "dark:aria-invalid:ring-destructive/40",
        // Dark mode background
        "dark:bg-surface-1",
        className
      )}
      {...props}
    />
  )
}

export { Input }
