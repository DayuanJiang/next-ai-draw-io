"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { useDictionary } from "@/hooks/use-dictionary"
import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "duration-200",
        className
      )}
      {...props}
    />
  )
}

function DialogContent(
  props: React.ComponentProps<typeof DialogPrimitive.Content>
) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogBox {...props} />
    </DialogPortal>
  )
}

/**
 * The onCloseAutoFocus of a dialog's content, for a component inside the
 * portal, which mounts it as the dialog opens. Radix gives the focus back
 * to a DialogTrigger. Most dialogs here open from state and have none (the
 * focus would be left on <body>): it goes back to what had it. An item of
 * a menu that closes as the dialog opens is gone by then, so such a menu
 * gives the focus to its own button before it opens the dialog.
 */
function useFocusReturn(onCloseAutoFocus?: (event: Event) => void) {
  // What has the focus as the dialog opens, read while rendering: once the
  // dialog is in the page, a field with autoFocus has taken it
  const [opener] = React.useState(() => document.activeElement)
  return (event: Event) => {
    onCloseAutoFocus?.(event)
    if (
      !event.defaultPrevented &&
      opener instanceof HTMLElement &&
      opener !== document.body
    ) {
      event.preventDefault()
      // Without scrolling to it, as Radix focuses a trigger: what the
      // dialog did may have brought something else into view (the
      // versions strip shows the version just restored)
      opener.focus({ preventScroll: true })
    }
  }
}

// Inside the portal, which mounts it as the dialog opens
function DialogBox({
  className,
  children,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const dict = useDictionary()
  const returnFocus = useFocusReturn(onCloseAutoFocus)
  return (
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn(
        // Base styles
        "fixed top-[50%] left-[50%] z-50 w-full",
        "max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%]",
        // In a window lower than the dialog its content scrolls: the
        // title, the close button and the buttons at the bottom would
        // be cut off above and below the window
        "max-h-[calc(100dvh-2rem)] overflow-y-auto",
        "grid gap-4 p-6",
        // Refined visual treatment
        "bg-surface-0 rounded-2xl border border-border-subtle shadow-pop",
        // Entry/exit animations
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
        "data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]",
        "duration-200 sm:max-w-lg",
        className
      )}
      {...props}
      onCloseAutoFocus={returnFocus}
    >
      {children}
      <DialogPrimitive.Close className={cn(
        "absolute top-4 right-4 rounded-xl p-1.5",
        "text-muted-foreground/60 hover:text-foreground",
        "hover:bg-interactive-hover",
        "transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:pointer-events-none",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4"
      )}>
        <XIcon />
        <span className="sr-only">{dict.common.close}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-xl font-semibold tracking-tight leading-tight",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useFocusReturn,
}
