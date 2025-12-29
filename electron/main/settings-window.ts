import path from "node:path"
import { app, BrowserWindow, ipcMain } from "electron"

let settingsWindow: BrowserWindow | null = null

/**
 * Create and show the settings window
 */
export function showSettingsWindow(parentWindow?: BrowserWindow): void {
    // If settings window already exists, focus it
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus()
        return
    }

    // Determine path to settings preload script
    // In compiled output: dist-electron/preload/settings.js
    const preloadPath = path.join(__dirname, "..", "preload", "settings.js")

    // Determine path to settings HTML
    // In packaged app: app.asar/dist-electron/settings/index.html
    // In development: electron/settings/index.html
    const settingsHtmlPath = app.isPackaged
        ? path.join(__dirname, "..", "settings", "index.html")
        : path.join(__dirname, "..", "..", "electron", "settings", "index.html")

    settingsWindow = new BrowserWindow({
        width: 600,
        height: 700,
        minWidth: 500,
        minHeight: 500,
        parent: parentWindow,
        modal: false,
        show: false,
        title: "Settings - Next AI Draw.io",
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    })
    settingsWindow.loadFile(settingsHtmlPath)

    settingsWindow.once("ready-to-show", () => {
        settingsWindow?.show()
    })

    settingsWindow.on("closed", () => {
        settingsWindow = null
    })
}

/**
 * Close the settings window if it exists
 */
export function closeSettingsWindow(): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close()
        settingsWindow = null
    }
}

/**
 * Check if settings window is open
 */
export function isSettingsWindowOpen(): boolean {
    return settingsWindow !== null && !settingsWindow.isDestroyed()
}

/**
 * Register settings window IPC handlers
 */
export function registerSettingsWindowHandlers(): void {
    ipcMain.on("settings:close", () => {
        closeSettingsWindow()
    })
}
