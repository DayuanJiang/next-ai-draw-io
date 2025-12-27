import { app, BrowserWindow, dialog, ipcMain } from "electron"

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
    // ==================== App Info ====================

    ipcMain.handle("get-version", () => {
        return app.getVersion()
    })

    // ==================== Window Controls ====================

    ipcMain.on("window-minimize", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.minimize()
    })

    ipcMain.on("window-maximize", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win?.isMaximized()) {
            win.unmaximize()
        } else {
            win?.maximize()
        }
    })

    ipcMain.on("window-close", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.close()
    })

    // ==================== File Dialogs ====================

    ipcMain.handle("dialog-open-file", async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return null

        const result = await dialog.showOpenDialog(win, {
            properties: ["openFile"],
            filters: [
                { name: "Draw.io Files", extensions: ["drawio", "xml"] },
                { name: "All Files", extensions: ["*"] },
            ],
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        // Read the file content
        const fs = await import("node:fs/promises")
        try {
            const content = await fs.readFile(result.filePaths[0], "utf-8")
            return content
        } catch (error) {
            console.error("Failed to read file:", error)
            return null
        }
    })

    ipcMain.handle("dialog-save-file", async (event, data: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return false

        const result = await dialog.showSaveDialog(win, {
            filters: [
                { name: "Draw.io Files", extensions: ["drawio"] },
                { name: "XML Files", extensions: ["xml"] },
            ],
        })

        if (result.canceled || !result.filePath) {
            return false
        }

        const fs = await import("node:fs/promises")
        try {
            await fs.writeFile(result.filePath, data, "utf-8")
            return true
        } catch (error) {
            console.error("Failed to save file:", error)
            return false
        }
    })
}
