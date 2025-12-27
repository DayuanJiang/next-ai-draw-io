import { app, Menu, type MenuItemConstructorOptions, shell } from "electron"

/**
 * Build and set the application menu
 */
export function buildAppMenu(): void {
    const template = getMenuTemplate()
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
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
        submenu: [isMac ? { role: "close" } : { role: "quit" }],
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
