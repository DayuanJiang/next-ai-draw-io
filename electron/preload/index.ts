import { contextBridge, ipcRenderer } from "electron"

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

    // Proxy settings
    getProxy: () => ipcRenderer.invoke("get-proxy"),
    setProxy: (config: { httpProxy?: string; httpsProxy?: string }) =>
        ipcRenderer.invoke("set-proxy", config),

    // User locale settings
    getUserLocale: () => ipcRenderer.invoke("get-user-locale"),
    setUserLocale: (locale: string) =>
        ipcRenderer.invoke("set-user-locale", locale),

    // A chat was saved, or the page loaded with this many chats: the next
    // launch opens the port where the chats are
    chatSaved: () => ipcRenderer.invoke("chat-saved"),
    chatsLoaded: (count: number) => ipcRenderer.invoke("chats-loaded", count),

    // The server restarted on the same port (another preset)
    onServerRestarted: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on("server-restarted", listener)
        return () => {
            ipcRenderer.removeListener("server-restarted", listener)
        }
    },
})
