import { app, BrowserWindow, dialog, shell } from "electron"
import { buildAppMenu } from "./app-menu"
import { getCurrentPresetEnv } from "./config-manager"
import { loadEnvFile } from "./env-loader"
import { registerIpcHandlers } from "./ipc-handlers"
import { startNextServer, stopNextServer } from "./next-server"
import { applyProxyToEnv } from "./proxy-manager"
import { registerSettingsWindowHandlers } from "./settings-window"
import { createWindow, getMainWindow } from "./window-manager"

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on("second-instance", () => {
        const mainWindow = getMainWindow()
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })

    // Load environment variables from .env files
    loadEnvFile()

    // Apply proxy settings from saved config
    applyProxyToEnv()

    // Apply saved preset environment variables (overrides .env)
    const presetEnv = getCurrentPresetEnv()
    for (const [key, value] of Object.entries(presetEnv)) {
        process.env[key] = value
    }

    const isDev = process.env.NODE_ENV === "development"
    let serverUrl: string | null = null

    app.whenReady().then(async () => {
        // Register IPC handlers
        registerIpcHandlers()
        registerSettingsWindowHandlers()

        // Build application menu
        buildAppMenu()

        try {
            if (isDev) {
                // Development: use the dev server URL
                serverUrl =
                    process.env.ELECTRON_DEV_URL || "http://localhost:6002"
                console.log(`Development mode: connecting to ${serverUrl}`)
            } else {
                // Production: start Next.js standalone server
                serverUrl = await startNextServer()
            }

            // Create main window
            createWindow(serverUrl)
        } catch (error) {
            console.error("Failed to start application:", error)
            dialog.showErrorBox(
                "Startup Error",
                `Failed to start the application: ${error instanceof Error ? error.message : "Unknown error"}`,
            )
            app.quit()
        }

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                if (serverUrl) {
                    createWindow(serverUrl)
                }
            }
        })
    })

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            stopNextServer()
            app.quit()
        }
    })

    app.on("before-quit", () => {
        stopNextServer()
    })

    // Open external links in default browser
    app.on("web-contents-created", (_, contents) => {
        contents.setWindowOpenHandler(({ url }) => {
            // Allow diagrams.net iframe
            if (
                url.includes("diagrams.net") ||
                url.includes("draw.io") ||
                url.startsWith("http://localhost")
            ) {
                return { action: "allow" }
            }
            // Open other links in external browser
            if (url.startsWith("http://") || url.startsWith("https://")) {
                shell.openExternal(url)
                return { action: "deny" }
            }
            return { action: "allow" }
        })
    })
}
