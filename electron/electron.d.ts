/**
 * Type declarations for Electron API exposed via preload script
 */

/** Proxy configuration interface */
interface ProxyConfig {
    httpProxy?: string
    httpsProxy?: string
}

/** Result of setting proxy */
interface SetProxyResult {
    success: boolean
    error?: string
}

/** Result of setting user locale */
interface SetUserLocaleResult {
    success: boolean
    error?: string
}

declare global {
    interface Window {
        /** Main window Electron API */
        electronAPI?: {
            /** Whether running in Electron environment */
            isElectron: boolean
            /** Get proxy configuration */
            getProxy: () => Promise<ProxyConfig>
            /** Set proxy configuration (saves and restarts server) */
            setProxy: (config: ProxyConfig) => Promise<SetProxyResult>
            /** Set user's preferred locale */
            setUserLocale: (locale: string) => Promise<SetUserLocaleResult>
            /**
             * Call back after the server restarted on the same port (proxy
             * change); returns a function that stops the calls
             */
            onServerRestarted?: (callback: () => void) => () => void
            /** A chat was saved: open this port next launch */
            chatSaved?: () => Promise<void>
            /** The page loaded with this many chats */
            chatsLoaded?: (count: number) => Promise<void>
            /**
             * Save draw.io's print preview window as a PDF (asks where);
             * whether it was saved
             */
            savePreviewAsPdf?: (fileName: string) => Promise<boolean>
        }
    }
}

export type { ProxyConfig }
