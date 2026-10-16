"use client"

import { Moon, Sun } from "lucide-react"
import { useDictionary } from "@/hooks/use-dictionary"
import { useSettingsStore } from "@/stores/settings-store"

/** Switches the site and the editor between light and dark */
export function ThemeToggle() {
    const label = useDictionary().shell.toggleTheme
    return (
        <button
            type="button"
            onClick={() => {
                const isDark =
                    document.documentElement.classList.contains("dark")
                useSettingsStore.getState().setTheme(isDark ? "light" : "dark")
            }}
            className="rounded-lg p-2 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={label}
            title={label}
        >
            {/* The page knows its theme only in the browser: show the icon
                with CSS, so the server's HTML is right for both */}
            <Moon className="size-[18px] dark:hidden" />
            <Sun className="hidden size-[18px] dark:block" />
        </button>
    )
}
