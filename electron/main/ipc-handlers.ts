import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron"
import { rebuildAppMenu, switchPreset } from "./app-menu"
import {
    type ConfigPreset,
    createPreset,
    deletePreset,
    getAllPresets,
    getCurrentPreset,
    getCurrentPresetId,
    getUserLocale,
    setCurrentPreset,
    setUserLocale,
    updatePreset,
} from "./config-manager"
import { restartNextServer } from "./next-server"
import { noteNoChats, rememberChatPort } from "./port-manager"
import {
    applyProxyToEnv,
    getProxyConfig,
    type ProxyConfig,
    saveProxyConfig,
} from "./proxy-manager"
import { isAppUrl } from "./window-manager"

/**
 * Allowed configuration keys for presets
 * This whitelist prevents arbitrary environment variable injection
 */
const ALLOWED_CONFIG_KEYS = new Set([
    "AI_PROVIDER",
    "AI_MODEL",
    "AI_API_KEY",
    "AI_BASE_URL",
    "TEMPERATURE",
])

/**
 * Sanitize preset config to only include allowed keys
 */
function sanitizePresetConfig(
    config: Record<string, string | undefined>,
): Record<string, string | undefined> {
    const sanitized: Record<string, string | undefined> = {}
    for (const key of ALLOWED_CONFIG_KEYS) {
        if (key in config && typeof config[key] === "string") {
            sanitized[key] = config[key]
        }
    }
    return sanitized
}

/**
 * Register an IPC handler that only answers the app's own pages
 * (the main window on the app server, or the local settings page).
 * A main window that somehow ends up on an external site still gets the
 * preload API, so its calls must be rejected here.
 */
function handle<Args extends unknown[]>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: Args) => unknown,
): void {
    ipcMain.handle(channel, (event, ...args) => {
        const url = event.senderFrame?.url
        if (!isAppUrl(url) && !url?.startsWith("file://")) {
            throw new Error(`Blocked "${channel}" from untrusted page: ${url}`)
        }
        return listener(event, ...(args as Args))
    })
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
    // ==================== App Info ====================

    handle("get-version", () => {
        return app.getVersion()
    })

    // ==================== Where the chats are ====================

    // The page saved a chat, or loaded without any: decides which port
    // (and so which origin's chats) the next launch opens
    handle("chat-saved", () => rememberChatPort())
    handle("chats-loaded", (_event, count: unknown) => {
        if (count === 0) noteNoChats()
    })

    // ==================== Window Controls ====================

    ipcMain.on("window-minimize", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.minimize()
    })

    ipcMain.on("window-maximize", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win?.isMaximized()) {
            win.unmaximize()
        } else {
            win?.maximize()
        }
    })

    ipcMain.on("window-close", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.close()
    })

    // ==================== Config Presets ====================

    handle("config-presets:get-all", () => {
        return getAllPresets()
    })

    handle("config-presets:get-current", () => {
        return getCurrentPreset()
    })

    handle("config-presets:get-current-id", () => {
        return getCurrentPresetId()
    })

    handle(
        "config-presets:save",
        async (
            _event,
            preset: Omit<ConfigPreset, "id" | "createdAt" | "updatedAt"> & {
                id?: string
            },
        ) => {
            // Validate preset name
            if (typeof preset?.name !== "string" || !preset.name.trim()) {
                throw new Error("Invalid preset name")
            }

            // Sanitize config to only allow whitelisted keys
            const sanitizedConfig = sanitizePresetConfig(preset.config ?? {})

            if (preset.id) {
                // Update existing preset
                const updated = updatePreset(preset.id, {
                    name: preset.name.trim(),
                    config: sanitizedConfig,
                })
                // Re-apply the active preset so the edit takes effect
                if (updated && updated.id === getCurrentPresetId()) {
                    await switchPreset(updated.id)
                } else {
                    rebuildAppMenu()
                }
                return updated
            }
            // Create new preset
            const created = createPreset({
                name: preset.name.trim(),
                config: sanitizedConfig,
            })
            rebuildAppMenu()
            return created
        },
    )

    handle("config-presets:delete", async (_event, id: string) => {
        const wasCurrent = id === getCurrentPresetId()
        // Deleting the active preset also clears its env vars
        const deleted = deletePreset(id)
        rebuildAppMenu()

        // Restart so the server stops using the deleted preset
        if (deleted && wasCurrent && app.isPackaged) {
            await restartNextServer()
        }
        return deleted
    })

    handle("config-presets:apply", async (_event, id: string) => {
        try {
            const env = await switchPreset(id)
            // In development mode, electron-dev.mjs restarts Next.js
            return app.isPackaged
                ? { success: true, env }
                : { success: true, env, devMode: true }
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to restart server",
            }
        }
    })

    handle("config-presets:set-current", (_event, id: string | null) => {
        return setCurrentPreset(id)
    })

    // ==================== Proxy Settings ====================

    handle("get-proxy", () => {
        return getProxyConfig()
    })

    handle("set-proxy", async (_event, config: ProxyConfig) => {
        const isOptionalString = (value: unknown) =>
            value === undefined || typeof value === "string"
        if (
            typeof config !== "object" ||
            config === null ||
            !isOptionalString(config.httpProxy) ||
            !isOptionalString(config.httpsProxy)
        ) {
            return { success: false, error: "Invalid proxy settings" }
        }

        try {
            // Save config to file
            saveProxyConfig({
                httpProxy: config.httpProxy,
                httpsProxy: config.httpsProxy,
            })

            // Apply to current process environment
            applyProxyToEnv()

            if (!app.isPackaged) {
                // In development, env vars are already applied
                // Next.js dev server may need manual restart
                return { success: true, devMode: true }
            }

            // Production: restart Next.js server to pick up new env vars
            await restartNextServer()
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to apply proxy settings",
            }
        }
    })

    // ==================== User Locale ====================

    handle("get-user-locale", () => {
        return getUserLocale()
    })

    handle("set-user-locale", (_event, locale: string) => {
        // Validate locale is one of the supported values
        if (!["en", "zh", "ja", "zh-Hant"].includes(locale)) {
            return { success: false, error: "Invalid locale" }
        }

        try {
            setUserLocale(locale as "en" | "zh" | "ja" | "zh-Hant")
            // Rebuild the menu to reflect the new locale
            rebuildAppMenu()
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to set locale",
            }
        }
    })
}
