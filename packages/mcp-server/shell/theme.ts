import { useSettingsStore } from "@/stores/settings-store"
import type { ShellConfig } from "./runtime-config"

/**
 * localStorage key of the user's theme choice here: "true" dark, "false"
 * light, none: the server's DRAWIO_DARK, else the system. Its own prefix,
 * so a web app dev server on the same port keeps its own settings.
 * index.html repeats the key in its inline script (run before this bundle).
 */
export const THEME_STORAGE_KEY = "mcp:dark-mode"

/** Whether the shell is dark, from the choice stored here, the server's
 * setting and the system */
export function isDarkPreferred(
    stored: string | null,
    drawioDark: ShellConfig["drawioDark"],
    systemDark: boolean,
): boolean {
    if (stored === "true" || stored === "false") return stored === "true"
    if (drawioDark === "auto") return systemDark
    return drawioDark === "dark"
}

function read(): string | null {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY)
    } catch {
        return null
    }
}

// The canvas components read the settings store's isDark (and the theme
// class, set before the first paint by index.html)
function apply(isDark: boolean) {
    document.documentElement.classList.toggle("dark", isDark)
    useSettingsStore.setState({
        hydrated: true,
        isDark,
        theme: isDark ? "dark" : "light",
    })
}

/** Take the theme the inline script chose, and follow the system while
 * nothing else decides */
export function initTheme(drawioDark: ShellConfig["drawioDark"]) {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    apply(isDarkPreferred(read(), drawioDark, query.matches))
    query.addEventListener("change", (event) => {
        apply(isDarkPreferred(read(), drawioDark, event.matches))
    })
}

/** The user's choice, kept for the next visit */
export function setDark(isDark: boolean) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, String(isDark))
    } catch {
        // Storage can be unavailable (private mode, quota)
    }
    apply(isDark)
}
