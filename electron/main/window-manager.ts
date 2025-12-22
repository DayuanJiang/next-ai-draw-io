import path from "node:path"
import { app, BrowserWindow, screen } from "electron"

let mainWindow: BrowserWindow | null = null

/**
 * Get the icon path based on platform
 * Note: electron-builder converts icon.png during packaging,
 * but at runtime we use PNG directly - Electron handles it
 */
function getIconPath(): string | undefined {
    // macOS doesn't need explicit icon - it's embedded in the app bundle
    if (process.platform === "darwin" && app.isPackaged) {
        return undefined
    }

    const iconName = "icon.png"

    if (app.isPackaged) {
        return path.join(process.resourcesPath, iconName)
    }

    // Development: use icon.png from resources
    return path.join(__dirname, "../../resources/icon.png")
}

/**
 * Create the main application window
 */
export function createWindow(serverUrl: string): BrowserWindow {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    mainWindow = new BrowserWindow({
        width: Math.min(1400, Math.floor(width * 0.9)),
        height: Math.min(900, Math.floor(height * 0.9)),
        minWidth: 800,
        minHeight: 600,
        title: "Next AI Draw.io",
        icon: getIconPath(),
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
    })

    // Load the Next.js application
    mainWindow.loadURL(serverUrl)

    // Show window when ready to prevent flashing
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show()
    })

    // Open DevTools in development
    if (process.env.NODE_ENV === "development") {
        mainWindow.webContents.openDevTools()
    }

    mainWindow.on("closed", () => {
        mainWindow = null
    })

    // Handle page title updates
    mainWindow.webContents.on("page-title-updated", (event, title) => {
        if (title && !title.includes("localhost")) {
            mainWindow?.setTitle(title)
        } else {
            event.preventDefault()
        }
    })

    return mainWindow
}

/**
 * Get the main window instance
 */
export function getMainWindow(): BrowserWindow | null {
    return mainWindow
}
