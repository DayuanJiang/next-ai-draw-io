/**
 * Preload script for settings window
 * Exposes APIs for managing configuration presets
 */
import { contextBridge, ipcRenderer } from "electron"

// Expose settings API to the renderer process
contextBridge.exposeInMainWorld("settingsAPI", {
    // Get all presets
    getPresets: () => ipcRenderer.invoke("config-presets:get-all"),

    // Get current preset ID
    getCurrentPresetId: () =>
        ipcRenderer.invoke("config-presets:get-current-id"),

    // Get current preset
    getCurrentPreset: () => ipcRenderer.invoke("config-presets:get-current"),

    // Save (create or update) a preset
    savePreset: (preset: {
        id?: string
        name: string
        config: Record<string, string | undefined>
    }) => ipcRenderer.invoke("config-presets:save", preset),

    // Delete a preset
    deletePreset: (id: string) =>
        ipcRenderer.invoke("config-presets:delete", id),

    // Apply a preset (sets environment variables and restarts server)
    applyPreset: (id: string) => ipcRenderer.invoke("config-presets:apply", id),

    // Close settings window
    close: () => ipcRenderer.send("settings:close"),
})
