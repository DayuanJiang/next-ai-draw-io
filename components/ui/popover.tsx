"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

function Popover({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  // A click on the canvas goes to draw.io's iframe and never reaches this
  // page, so Radix does not see it as a click outside. The window loses
  // focus to the iframe then: close the popover on that. A switch to
  // another window or tab leaves the focus where it is in this page, and
  // the popover open with what was typed in it
  React.useEffect(() => {
    if (!open || !onOpenChange) return
    const close = () =>
      // A tick later: Firefox gives the frame the focus after this event
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          onOpenChange(false)
        }
      })
    window.addEventListener("blur", close)
    return () => window.removeEventListener("blur", close)
  }, [open, onOpenChange])
  return (
    <PopoverPrimitive.Root
      data-slot="popover"
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          // Closed by a click on the canvas (see Popover): the focus stays
          // in the frame, where the keys go to the shape just clicked.
          // Radix would give it back to the popover's button
          if (document.activeElement instanceof HTMLIFrameElement) {
            event.preventDefault()
          }
        }}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
