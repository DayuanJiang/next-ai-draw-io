import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { rebuildAppMenu } from "./app-menu"
import {
    applyPresetToEnv,
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
import {
    applyProxyToEnv,
    getProxyConfig,
    type ProxyConfig,
    saveProxyConfig,
} from "./proxy-manager"

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
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
    // ==================== App Info ====================

    ipcMain.handle("get-version", () => {
        return app.getVersion()
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

    // ==================== File Dialogs ====================

    ipcMain.handle("dialog-open-file", async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return null

        const result = await dialog.showOpenDialog(win, {
            properties: ["openFile"],
            filters: [
                { name: "Draw.io Files", extensions: ["drawio", "xml"] },
                { name: "All Files", extensions: ["*"] },
            ],
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        // Read the file content
        const fs = await import("node:fs/promises")
        try {
            const content = await fs.readFile(result.filePaths[0], "utf-8")
            return content
        } catch (error) {
            console.error("Failed to read file:", error)
            return null
        }
    })

    ipcMain.handle("dialog-save-file", async (event, data: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return false

        const result = await dialog.showSaveDialog(win, {
            filters: [
                { name: "Draw.io Files", extensions: ["drawio"] },
                { name: "XML Files", extensions: ["xml"] },
            ],
        })

        if (result.canceled || !result.filePath) {
            return false
        }

        const fs = await import("node:fs/promises")
        try {
            await fs.writeFile(result.filePath, data, "utf-8")
            return true
        } catch (error) {
            console.error("Failed to save file:", error)
            return false
        }
    })

    // ==================== Config Presets ====================

    ipcMain.handle("config-presets:get-all", () => {
        return getAllPresets()
    })

    ipcMain.handle("config-presets:get-current", () => {
        return getCurrentPreset()
    })

    ipcMain.handle("config-presets:get-current-id", () => {
        return getCurrentPresetId()
    })

    ipcMain.handle(
        "config-presets:save",
        (
            _event,
            preset: Omit<ConfigPreset, "id" | "createdAt" | "updatedAt"> & {
                id?: string
            },
        ) => {
            // Validate preset name
            if (typeof preset.name !== "string" || !preset.name.trim()) {
                throw new Error("Invalid preset name")
            }

            // Sanitize config to only allow whitelisted keys
            const sanitizedConfig = sanitizePresetConfig(preset.config ?? {})

            if (preset.id) {
                // Update existing preset
                return updatePreset(preset.id, {
                    name: preset.name.trim(),
                    config: sanitizedConfig,
                })
            }
            // Create new preset
            return createPreset({
                name: preset.name.trim(),
                config: sanitizedConfig,
            })
        },
    )

    ipcMain.handle("config-presets:delete", (_event, id: string) => {
        return deletePreset(id)
    })

    ipcMain.handle("config-presets:apply", async (_event, id: string) => {
        const env = applyPresetToEnv(id)
        if (!env) {
            return { success: false, error: "Preset not found" }
        }

        const isDev = process.env.NODE_ENV === "development"

        if (isDev) {
            // In development mode, the config file change will trigger
            // the file watcher in electron-dev.mjs to restart Next.js
            // We just need to save the preset (already done in applyPresetToEnv)
            return { success: true, env, devMode: true }
        }

        // Production mode: restart the Next.js server to apply new environment variables
        try {
            await restartNextServer()
            return { success: true, env }
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

    ipcMain.handle(
        "config-presets:set-current",
        (_event, id: string | null) => {
            return setCurrentPreset(id)
        },
    )

    // ==================== Proxy Settings ====================

    ipcMain.handle("get-proxy", () => {
        return getProxyConfig()
    })

    ipcMain.handle("set-proxy", async (_event, config: ProxyConfig) => {
        try {
            // Save config to file
            saveProxyConfig(config)

            // Apply to current process environment
            applyProxyToEnv()

            const isDev = process.env.NODE_ENV === "development"

            if (isDev) {
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

    ipcMain.handle("get-user-locale", () => {
        return getUserLocale()
    })

    ipcMain.handle("set-user-locale", (_event, locale: string) => {
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
