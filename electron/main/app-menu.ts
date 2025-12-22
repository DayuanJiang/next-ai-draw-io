import {
    app,
    BrowserWindow,
    dialog,
    Menu,
    type MenuItemConstructorOptions,
    shell,
} from "electron"
import {
    applyPresetToEnv,
    getAllPresets,
    getCurrentPresetId,
    setCurrentPreset,
} from "./config-manager"
import { restartNextServer } from "./next-server"
import { showSettingsWindow } from "./settings-window"

/**
 * Build and set the application menu
 */
export function buildAppMenu(): void {
    const template = getMenuTemplate()
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

/**
 * Rebuild the menu (call this when presets change)
 */
export function rebuildAppMenu(): void {
    buildAppMenu()
}

/**
 * Get the menu template
 */
function getMenuTemplate(): MenuItemConstructorOptions[] {
    const isMac = process.platform === "darwin"

    const template: MenuItemConstructorOptions[] = []

    // macOS app menu
    if (isMac) {
        template.push({
            label: app.name,
            submenu: [
                { role: "about" },
                { type: "separator" },
                {
                    label: "Settings...",
                    accelerator: "CmdOrCtrl+,",
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow()
                        showSettingsWindow(win || undefined)
                    },
                },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
            ],
        })
    }

    // File menu
    template.push({
        label: "File",
        submenu: [
            ...(isMac
                ? []
                : [
                      {
                          label: "Settings",
                          accelerator: "CmdOrCtrl+,",
                          click: () => {
                              const win = BrowserWindow.getFocusedWindow()
                              showSettingsWindow(win || undefined)
                          },
                      },
                      { type: "separator" } as MenuItemConstructorOptions,
                  ]),
            isMac ? { role: "close" } : { role: "quit" },
        ],
    })

    // Edit menu
    template.push({
        label: "Edit",
        submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            ...(isMac
                ? [
                      {
                          role: "pasteAndMatchStyle",
                      } as MenuItemConstructorOptions,
                      { role: "delete" } as MenuItemConstructorOptions,
                      { role: "selectAll" } as MenuItemConstructorOptions,
                  ]
                : [
                      { role: "delete" } as MenuItemConstructorOptions,
                      { type: "separator" } as MenuItemConstructorOptions,
                      { role: "selectAll" } as MenuItemConstructorOptions,
                  ]),
        ],
    })

    // View menu
    template.push({
        label: "View",
        submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
        ],
    })

    // Configuration menu with presets
    template.push(buildConfigMenu())

    // Window menu
    template.push({
        label: "Window",
        submenu: [
            { role: "minimize" },
            { role: "zoom" },
            ...(isMac
                ? [
                      { type: "separator" } as MenuItemConstructorOptions,
                      { role: "front" } as MenuItemConstructorOptions,
                  ]
                : [{ role: "close" } as MenuItemConstructorOptions]),
        ],
    })

    // Help menu
    template.push({
        label: "Help",
        submenu: [
            {
                label: "Documentation",
                click: async () => {
                    await shell.openExternal(
                        "https://github.com/dayuanjiang/next-ai-draw-io",
                    )
                },
            },
            {
                label: "Report Issue",
                click: async () => {
                    await shell.openExternal(
                        "https://github.com/dayuanjiang/next-ai-draw-io/issues",
                    )
                },
            },
        ],
    })

    return template
}

/**
 * Build the Configuration menu with presets
 */
function buildConfigMenu(): MenuItemConstructorOptions {
    const presets = getAllPresets()
    const currentPresetId = getCurrentPresetId()

    const presetItems: MenuItemConstructorOptions[] = presets.map((preset) => ({
        label: preset.name,
        type: "radio",
        checked: preset.id === currentPresetId,
        click: async () => {
            const previousPresetId = getCurrentPresetId()
            const env = applyPresetToEnv(preset.id)

            if (env) {
                try {
                    await restartNextServer()
                    rebuildAppMenu() // Rebuild menu to update checkmarks
                } catch (error) {
                    console.error("Failed to restart server:", error)

                    // Revert to previous preset on failure
                    if (previousPresetId) {
                        applyPresetToEnv(previousPresetId)
                    } else {
                        setCurrentPreset(null)
                    }

                    // Rebuild menu to restore previous checkmark state
                    rebuildAppMenu()

                    // Show error dialog to notify user
                    dialog.showErrorBox(
                        "Configuration Error",
                        `Failed to apply preset "${preset.name}". The server could not be restarted.\n\nThe previous configuration has been restored.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
                    )
                }
            }
        },
    }))

    return {
        label: "Configuration",
        submenu: [
            ...(presetItems.length > 0
                ? [
                      { label: "Switch Preset", enabled: false },
                      { type: "separator" } as MenuItemConstructorOptions,
                      ...presetItems,
                      { type: "separator" } as MenuItemConstructorOptions,
                  ]
                : []),
            {
                label:
                    presetItems.length > 0
                        ? "Manage Presets..."
                        : "Add Configuration Preset...",
                click: () => {
                    const win = BrowserWindow.getFocusedWindow()
                    showSettingsWindow(win || undefined)
                },
            },
        ],
    }
}
