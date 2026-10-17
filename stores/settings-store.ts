import { create } from "zustand"
import { STORAGE_KEYS } from "@/lib/storage"

export type ThemePreference = "light" | "dark" | "system"
export type SendShortcut = "enter" | "ctrl-enter"

export const PANEL_MIN_WIDTH = 320
export const PANEL_MAX_WIDTH = 560
export const PANEL_DEFAULT_WIDTH = 384

interface SettingsState {
    hydrated: boolean
    theme: ThemePreference
    /** Resolved from `theme` and the system setting */
    isDark: boolean
    sendShortcut: SendShortcut
    minimalStyle: boolean
    vlmValidationEnabled: boolean
    customSystemMessage: string
    maxOutputTokens: string
    panelWidth: number
    hydrate: () => void
    setTheme: (theme: ThemePreference) => void
    setSendShortcut: (value: SendShortcut) => void
    setMinimalStyle: (value: boolean) => void
    setVlmValidationEnabled: (value: boolean) => void
    setCustomSystemMessage: (value: string) => void
    setMaxOutputTokens: (value: string) => void
    setPanelWidth: (value: number) => void
}

function read(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function write(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
    } catch {
        // Storage can be unavailable (private mode, quota)
    }
}

function systemPrefersDark(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyDarkClass(isDark: boolean) {
    document.documentElement.classList.toggle("dark", isDark)
}

export function clampPanelWidth(width: number): number {
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width))
}

/**
 * Whether a key press in a message box sends it: Cmd/Ctrl+Enter always
 * does, plain Enter too unless the user chose Cmd/Ctrl+Enter, and
 * Shift+Enter adds a line
 */
export function isSendKey(
    event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey">,
    shortcut: SendShortcut,
): boolean {
    if (event.key !== "Enter") return false
    if (event.metaKey || event.ctrlKey) return true
    return shortcut === "enter" && !event.shiftKey
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    hydrated: false,
    theme: "system",
    isDark: false,
    sendShortcut: "enter",
    minimalStyle: false,
    vlmValidationEnabled: false,
    customSystemMessage: "",
    maxOutputTokens: "",
    panelWidth: PANEL_DEFAULT_WIDTH,

    hydrate: () => {
        // A page of another language renders <html> again, without the
        // dark class: put it back
        if (get().hydrated) {
            applyDarkClass(get().isDark)
            return
        }
        // Stored as "true"/"false"; missing means follow the system
        const storedDark = read(STORAGE_KEYS.darkMode)
        const theme: ThemePreference =
            storedDark === "true"
                ? "dark"
                : storedDark === "false"
                  ? "light"
                  : "system"
        const isDark =
            theme === "system" ? systemPrefersDark() : theme === "dark"
        const width = Number(read(STORAGE_KEYS.panelWidth))
        set({
            hydrated: true,
            theme,
            isDark,
            // Stored only when picked in Settings: a stored "ctrl-enter" is
            // the user's own choice, so it stays
            sendShortcut:
                read(STORAGE_KEYS.sendShortcut) === "ctrl-enter"
                    ? "ctrl-enter"
                    : "enter",
            minimalStyle: read(STORAGE_KEYS.minimalStyle) === "true",
            vlmValidationEnabled:
                read(STORAGE_KEYS.vlmValidationEnabled) === "true",
            customSystemMessage: read(STORAGE_KEYS.customSystemMessage) ?? "",
            maxOutputTokens: read(STORAGE_KEYS.maxOutputTokens) ?? "",
            panelWidth: width ? clampPanelWidth(width) : PANEL_DEFAULT_WIDTH,
        })
        applyDarkClass(isDark)

        // Follow system changes while the preference is "system"
        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", (event) => {
                if (get().theme !== "system") return
                set({ isDark: event.matches })
                applyDarkClass(event.matches)
            })
    },

    setTheme: (theme) => {
        write(
            STORAGE_KEYS.darkMode,
            theme === "system" ? null : String(theme === "dark"),
        )
        const isDark =
            theme === "system" ? systemPrefersDark() : theme === "dark"
        set({ theme, isDark })
        applyDarkClass(isDark)
    },
    setSendShortcut: (value) => {
        write(STORAGE_KEYS.sendShortcut, value)
        set({ sendShortcut: value })
    },
    setMinimalStyle: (value) => {
        write(STORAGE_KEYS.minimalStyle, String(value))
        set({ minimalStyle: value })
    },
    setVlmValidationEnabled: (value) => {
        write(STORAGE_KEYS.vlmValidationEnabled, String(value))
        set({ vlmValidationEnabled: value })
    },
    setCustomSystemMessage: (value) => {
        write(STORAGE_KEYS.customSystemMessage, value)
        set({ customSystemMessage: value })
    },
    setMaxOutputTokens: (value) => {
        const digitsOnly = value.replace(/\D/g, "")
        write(STORAGE_KEYS.maxOutputTokens, digitsOnly)
        set({ maxOutputTokens: digitsOnly })
    },
    setPanelWidth: (value) => {
        const width = clampPanelWidth(Math.round(value))
        write(STORAGE_KEYS.panelWidth, String(width))
        set({ panelWidth: width })
    },
}))

/**
 * Inline script for <head>: applies the dark class before the first paint so
 * dark mode does not flash white while the page loads.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
    STORAGE_KEYS.darkMode,
)});var d=v==="true"||(v===null&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`
