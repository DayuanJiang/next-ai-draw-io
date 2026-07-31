import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron"

// Locally defined to avoid dependency on electron.d.ts compilation scope
type UpdateStatus =
    | { status: "available"; version: string }
    | { status: "available-manual"; version: string; url: string }
    | { status: "downloading"; percent: number }
    | { status: "downloaded" }
    | { status: "error"; message: string }

/**
 * Expose safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld("electronAPI", {
    // Platform information
    platform: process.platform,

    // Check if running in Electron
    isElectron: true,

    // Application version
    getVersion: () => ipcRenderer.invoke("get-version"),

    // Window controls (optional, for custom title bar)
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),

    // File operations
    openFile: () => ipcRenderer.invoke("dialog-open-file"),
    saveFile: (data: string) => ipcRenderer.invoke("dialog-save-file", data),

    // Proxy settings
    getProxy: () => ipcRenderer.invoke("get-proxy"),
    setProxy: (config: { httpProxy?: string; httpsProxy?: string }) =>
        ipcRenderer.invoke("set-proxy", config),

    // User locale settings
    getUserLocale: () => ipcRenderer.invoke("get-user-locale"),
    setUserLocale: (locale: string) =>
        ipcRenderer.invoke("set-user-locale", locale),

    // Auto-update
    onUpdateStatus: (callback: (data: UpdateStatus) => void) => {
        const handler = (_event: IpcRendererEvent, data: UpdateStatus) =>
            callback(data)
        ipcRenderer.on("update-status", handler)
        return () => ipcRenderer.removeListener("update-status", handler)
    },
    startDownload: () => ipcRenderer.invoke("updater:start-download"),
})
