import { app, Menu, type MenuItemConstructorOptions, shell } from "electron"
import {
    getMenuTranslations,
    getPreferredLocale,
    type RoleLabels,
} from "./menu-i18n"

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

    // An item that Electron runs by its role. Electron labels these in
    // English on every system, so the other languages bring their own label.
    const role = (name: keyof RoleLabels): MenuItemConstructorOptions => {
        const label = t.roles?.[name]
        return label ? { role: name, label } : { role: name }
    }

    const template: MenuItemConstructorOptions[] = []

    // macOS app menu
    if (isMac) {
        template.push({
            label: app.name,
            submenu: [
                role("about"),
                { type: "separator" },
                role("services"),
                { type: "separator" },
                role("hide"),
                role("hideOthers"),
                role("unhide"),
                { type: "separator" },
                role("quit"),
            ],
        })
    }

    // File menu
    template.push({
        label: t.file,
        submenu: [isMac ? role("close") : role("quit")],
    })

    // Edit menu
    template.push({
        label: t.edit,
        submenu: [
            role("undo"),
            role("redo"),
            { type: "separator" },
            role("cut"),
            role("copy"),
            role("paste"),
            ...(isMac
                ? [
                      role("pasteAndMatchStyle"),
                      role("delete"),
                      role("selectAll"),
                  ]
                : [
                      role("delete"),
                      { type: "separator" } as MenuItemConstructorOptions,
                      role("selectAll"),
                  ]),
        ],
    })

    // View menu
    template.push({
        label: t.view,
        submenu: [
            role("reload"),
            role("forceReload"),
            role("toggleDevTools"),
            { type: "separator" },
            role("resetZoom"),
            role("zoomIn"),
            role("zoomOut"),
            { type: "separator" },
            role("togglefullscreen"),
        ],
    })

    // Window menu
    template.push({
        label: t.window,
        submenu: [
            role("minimize"),
            role("zoom"),
            ...(isMac
                ? [
                      { type: "separator" } as MenuItemConstructorOptions,
                      role("front"),
                  ]
                : [role("close")]),
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
