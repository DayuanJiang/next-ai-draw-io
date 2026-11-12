"use client"

import { useLayoutEffect } from "react"
import { Toaster } from "sonner"
import { useDictionary } from "@/hooks/use-dictionary"
import { useSettingsStore } from "@/stores/settings-store"

/** The single toast container, mounted once at the root */
export function AppToaster() {
    const isDark = useSettingsStore((s) => s.isDark)
    // Reads the stored theme on every page (the site's pages and the 404
    // page have no editor to read it). The layout mounts again for each
    // language, and React then renders <html> without the dark class that
    // the inline script added: hydrate() puts it back before the paint.
    // (The MCP shell has set its own theme by now, which hydrate() keeps.)
    useLayoutEffect(() => {
        useSettingsStore.getState().hydrate()
    }, [])
    const dict = useDictionary()
    return (
        <Toaster
            position="bottom-center"
            // Show stacked toasts in full, so a later one never covers the
            // button of an earlier one (e.g. "Continue without saving")
            expand
            theme={isDark ? "dark" : "light"}
            offset={{ bottom: 20 }}
            mobileOffset={{ bottom: 72 }}
            // What a screen reader calls the region; sonner's own is English
            containerAriaLabel={dict.common.notifications}
            toastOptions={{
                duration: 2500,
                style: { maxWidth: "480px" },
                classNames: {
                    toast: "!rounded-xl !border-border !bg-card !text-foreground !shadow-pop",
                    description: "!text-muted-foreground",
                },
            }}
        />
    )
}
