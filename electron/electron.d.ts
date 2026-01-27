/**
 * Type declarations for Electron API exposed via preload script
 */

/** Configuration preset interface */
interface ConfigPreset {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    config: {
        AI_PROVIDER?: string
        AI_MODEL?: string
        AI_API_KEY?: string
        AI_BASE_URL?: string
        TEMPERATURE?: string
        [key: string]: string | undefined
    }
}

/** Result of applying a preset */
interface ApplyPresetResult {
    success: boolean
    error?: string
    env?: Record<string, string>
}

/** Proxy configuration interface */
interface ProxyConfig {
    httpProxy?: string
    httpsProxy?: string
}

/** Result of setting proxy */
interface SetProxyResult {
    success: boolean
    error?: string
    devMode?: boolean
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
            /** Current platform (darwin, win32, linux) */
            platform: NodeJS.Platform
            /** Whether running in Electron environment */
            isElectron: boolean
            /** Get application version */
            getVersion: () => Promise<string>
            /** Minimize the window */
            minimize: () => void
            /** Maximize/restore the window */
            maximize: () => void
            /** Close the window */
            close: () => void
            /** Open file dialog and return file path */
            openFile: () => Promise<string | null>
            /** Save data to file via save dialog */
            saveFile: (data: string) => Promise<boolean>
            /** Get proxy configuration */
            getProxy: () => Promise<ProxyConfig>
            /** Set proxy configuration (saves and restarts server) */
            setProxy: (config: ProxyConfig) => Promise<SetProxyResult>
            /** Get user's preferred locale */
            getUserLocale: () => Promise<
                "en" | "zh" | "ja" | "zh-Hant" | undefined
            >
            /** Set user's preferred locale */
            setUserLocale: (locale: string) => Promise<SetUserLocaleResult>
        }

        /** Settings window Electron API */
        settingsAPI?: {
            /** Get all configuration presets */
            getPresets: () => Promise<ConfigPreset[]>
            /** Get current preset ID */
            getCurrentPresetId: () => Promise<string | null>
            /** Get current preset */
            getCurrentPreset: () => Promise<ConfigPreset | null>
            /** Save (create or update) a preset */
            savePreset: (preset: {
                id?: string
                name: string
                config: Record<string, string | undefined>
            }) => Promise<ConfigPreset>
            /** Delete a preset */
            deletePreset: (id: string) => Promise<boolean>
            /** Apply a preset (sets environment variables and restarts server) */
            applyPreset: (id: string) => Promise<ApplyPresetResult>
            /** Close settings window */
            close: () => void
        }
    }
}

export type {
    ConfigPreset,
    ApplyPresetResult,
    ProxyConfig,
    SetProxyResult,
    SetUserLocaleResult,
}
