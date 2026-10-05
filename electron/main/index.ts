import { app, BrowserWindow, dialog, shell } from "electron"
import { buildAppMenu } from "./app-menu"
import { applyCurrentPresetToEnv } from "./config-manager"
import { loadEnvFile } from "./env-loader"
import { registerIpcHandlers } from "./ipc-handlers"
import { startNextServer, stopNextServer } from "./next-server"
import { applyProxyToEnv } from "./proxy-manager"
import { registerSettingsWindowHandlers } from "./settings-window"
import {
    createWindow,
    getAppUrl,
    getMainWindow,
    isAppUrl,
} from "./window-manager"

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

    const isDev = !app.isPackaged

    app.whenReady().then(async () => {
        // Apply saved preset environment variables (overrides .env).
        // Must run after ready: on Windows and Linux safeStorage can't
        // decrypt the API key before that.
        applyCurrentPresetToEnv()

        // Register IPC handlers
        registerIpcHandlers()
        registerSettingsWindowHandlers()

        // Build application menu
        buildAppMenu()

        try {
            let serverUrl: string
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
                const appUrl = getAppUrl()
                if (appUrl) {
                    createWindow(appUrl)
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

    // Pages allowed inside app windows: the app server and draw.io
    const isInAppUrl = (url: string): boolean => {
        if (isAppUrl(url)) return true
        try {
            const { hostname } = new URL(url)
            return ["diagrams.net", "draw.io"].some(
                (domain) =>
                    hostname === domain || hostname.endsWith(`.${domain}`),
            )
        } catch {
            return false
        }
    }

    const isWebUrl = (url: string): boolean =>
        url.startsWith("http://") || url.startsWith("https://")

    // Open external links in default browser
    app.on("web-contents-created", (_, contents) => {
        contents.setWindowOpenHandler(({ url }) => {
            if (isInAppUrl(url)) {
                return { action: "allow" }
            }
            // Open other links in external browser
            if (isWebUrl(url)) {
                shell.openExternal(url)
                return { action: "deny" }
            }
            return { action: "allow" }
        })

        // Clicking a plain link would otherwise replace the app page with
        // an external site that keeps the preload API. Only the page
        // itself may navigate there; draw.io stays in its frame (this event
        // is for the main frame only)
        contents.on("will-navigate", (event) => {
            if (isAppUrl(event.url)) {
                return
            }
            event.preventDefault()
            if (isWebUrl(event.url)) {
                shell.openExternal(event.url)
            }
        })
    })
}
