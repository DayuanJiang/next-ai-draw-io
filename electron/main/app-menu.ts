// electron/main/app-menu.ts (updated with i18n support)
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
import { getMenuTranslations, getPreferredLocale } from "./menu-i18n"
import { restartNextServer } from "./next-server"
import { showSettingsWindow } from "./settings-window"

/**
 * Build and set the application menu with i18n support
 */
export function buildAppMenu(): void {
    const template = getMenuTemplate()
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

/**
 * Rebuild the menu (call this when presets change or language changes)
 */
export function rebuildAppMenu(): void {
    buildAppMenu()
}

/**
 * Get the menu template with translations
 */
function getMenuTemplate(): MenuItemConstructorOptions[] {
    const isMac = process.platform === "darwin"

    // Get translations for preferred locale (saved preference or system default)
    const locale = getPreferredLocale(app.getLocale())
    const t = getMenuTranslations(locale)

    const template: MenuItemConstructorOptions[] = []

    // macOS app menu
    if (isMac) {
        template.push({
            label: app.name,
            submenu: [
                { role: "about" }, // System-translated
                { type: "separator" },
                {
                    label: t.settings,
                    accelerator: "CmdOrCtrl+,",
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow()
                        showSettingsWindow(win || undefined)
                    },
                },
                { type: "separator" },
                { role: "services" }, // System-translated
                { type: "separator" },
                { role: "hide" }, // System-translated
                { role: "hideOthers" }, // System-translated
                { role: "unhide" }, // System-translated
                { type: "separator" },
                { role: "quit" }, // System-translated
            ],
        })
    }

    // File menu
    template.push({
        label: t.file,
        submenu: [
            ...(isMac
                ? []
                : [
                      {
                          label: t.settings,
                          accelerator: "CmdOrCtrl+,",
                          click: () => {
                              const win = BrowserWindow.getFocusedWindow()
                              showSettingsWindow(win || undefined)
                          },
                      },
                      { type: "separator" } as MenuItemConstructorOptions,
                  ]),
            isMac ? { role: "close" } : { role: "quit" }, // System-translated
        ],
    })

    // Edit menu
    template.push({
        label: t.edit,
        submenu: [
            { role: "undo" }, // System-translated
            { role: "redo" }, // System-translated
            { type: "separator" },
            { role: "cut" }, // System-translated
            { role: "copy" }, // System-translated
            { role: "paste" }, // System-translated
            ...(isMac
                ? [
                      {
                          role: "pasteAndMatchStyle",
                      } as MenuItemConstructorOptions, // System-translated
                      { role: "delete" } as MenuItemConstructorOptions, // System-translated
                      { role: "selectAll" } as MenuItemConstructorOptions, // System-translated
                  ]
                : [
                      { role: "delete" } as MenuItemConstructorOptions, // System-translated
                      { type: "separator" } as MenuItemConstructorOptions,
                      { role: "selectAll" } as MenuItemConstructorOptions, // System-translated
                  ]),
        ],
    })

    // View menu
    template.push({
        label: t.view,
        submenu: [
            { role: "reload" }, // System-translated
            { role: "forceReload" }, // System-translated
            { role: "toggleDevTools" }, // System-translated
            { type: "separator" },
            { role: "resetZoom" }, // System-translated
            { role: "zoomIn" }, // System-translated
            { role: "zoomOut" }, // System-translated
            { type: "separator" },
            { role: "togglefullscreen" }, // System-translated
        ],
    })

    // Configuration menu with presets
    template.push(buildConfigMenu(t))

    // Window menu
    template.push({
        label: t.window,
        submenu: [
            { role: "minimize" }, // System-translated
            { role: "zoom" }, // System-translated
            ...(isMac
                ? [
                      { type: "separator" } as MenuItemConstructorOptions,
                      { role: "front" } as MenuItemConstructorOptions, // System-translated
                  ]
                : [{ role: "close" } as MenuItemConstructorOptions]), // System-translated
        ],
    })

    // Help menu
    template.push({
        label: t.help,
        submenu: [
            {
                label: t.documentation,
                click: async () => {
                    await shell.openExternal(
                        "https://github.com/dayuanjiang/next-ai-draw-io",
                    )
                },
            },
            {
                label: t.reportIssue,
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
function buildConfigMenu(
    t: ReturnType<typeof getMenuTranslations>,
): MenuItemConstructorOptions {
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
        label: t.configuration,
        submenu: [
            ...(presetItems.length > 0
                ? [
                      { label: t.switchPreset, enabled: false },
                      { type: "separator" } as MenuItemConstructorOptions,
                      ...presetItems,
                      { type: "separator" } as MenuItemConstructorOptions,
                  ]
                : []),
            {
                label:
                    presetItems.length > 0
                        ? t.managePresets
                        : t.addConfigurationPreset,
                click: () => {
                    const win = BrowserWindow.getFocusedWindow()
                    showSettingsWindow(win || undefined)
                },
            },
        ],
    }
}
