"use client"

import { Toaster } from "sonner"
import { useSettingsStore } from "@/stores/settings-store"

/** The single toast container, mounted once at the root */
export function AppToaster() {
    const isDark = useSettingsStore((s) => s.isDark)
    return (
        <Toaster
            position="bottom-center"
            // Show stacked toasts in full, so a later one never covers the
            // button of an earlier one (e.g. "Continue without saving")
            expand
            theme={isDark ? "dark" : "light"}
            offset={{ bottom: 20 }}
            mobileOffset={{ bottom: 72 }}
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
