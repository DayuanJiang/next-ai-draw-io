/**
 * Type declarations for Electron API exposed via preload script
 */

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
        }
    }
}

export {}
