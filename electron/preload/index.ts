import { contextBridge, ipcRenderer } from "electron"

/**
 * Expose safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld("electronAPI", {
    // Check if running in Electron
    isElectron: true,

    // Proxy settings
    getProxy: () => ipcRenderer.invoke("get-proxy"),
    setProxy: (config: { httpProxy?: string; httpsProxy?: string }) =>
        ipcRenderer.invoke("set-proxy", config),

    // User locale settings
    setUserLocale: (locale: string) =>
        ipcRenderer.invoke("set-user-locale", locale),

    // A chat was saved, or the page loaded with this many chats: the next
    // launch opens the port where the chats are
    chatSaved: () => ipcRenderer.invoke("chat-saved"),
    chatsLoaded: (count: number) => ipcRenderer.invoke("chats-loaded", count),

    // draw.io's PDF export: save its print preview as a PDF file
    savePreviewAsPdf: (fileName: string) =>
        ipcRenderer.invoke("save-preview-as-pdf", fileName),

    // The server restarted on the same port (proxy change)
    onServerRestarted: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on("server-restarted", listener)
        return () => {
            ipcRenderer.removeListener("server-restarted", listener)
        }
    },
})
