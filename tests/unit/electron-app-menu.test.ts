// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ locale: "en-US", template: [] as any[] }))
vi.mock("electron", () => ({
    app: {
        name: "Next AI Draw.io",
        getLocale: () => state.locale,
        // No saved language there, so the system's language decides
        getPath: () => "/nonexistent",
    },
    Menu: {
        buildFromTemplate: (template: any[]) => {
            state.template = template
        },
        setApplicationMenu: () => {},
    },
    shell: {},
}))

import { buildAppMenu } from "@/electron/main/app-menu"

/** The menu items that Electron runs by a role, as [role, label] */
function roleItems(locale: string): [string, string | undefined][] {
    state.locale = locale
    buildAppMenu()
    return state.template.flatMap((menu) =>
        menu.submenu
            .filter((item: any) => item.role)
            .map((item: any) => [item.role, item.label]),
    )
}

describe("desktop app menu", () => {
    it("labels the role items in the menu's language", () => {
        for (const locale of ["zh-CN", "ja", "zh-TW"]) {
            const items = roleItems(locale)
            expect(items.length).toBeGreaterThan(15)
            for (const [role, label] of items) {
                // Electron's own label would be English
                expect(label, `${locale} ${role}`).toMatch(/\P{ASCII}/u)
            }
        }
    })

    it("leaves English to Electron's own labels", () => {
        for (const [, label] of roleItems("en-US")) {
            expect(label).toBeUndefined()
        }
    })
})
