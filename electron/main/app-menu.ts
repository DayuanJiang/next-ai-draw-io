import { app, Menu, type MenuItemConstructorOptions, shell } from "electron"
import { getMenuTranslations, getPreferredLocale } from "./menu-i18n"

/**
 * Build and set the application menu with i18n support
 * (call again when the language changes)
 */
export function buildAppMenu(): void {
    const template = getMenuTemplate()
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
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
