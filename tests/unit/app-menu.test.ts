// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
    app: {
        isPackaged: true,
        getName: () => "app",
        getVersion: () => "1",
        getLocale: () => "en",
    },
    BrowserWindow: { getFocusedWindow: () => null },
    dialog: {},
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
    shell: {},
}))

// The saved current preset, and restarts that wait until the test ends them
const state = vi.hoisted(() => ({
    current: "A" as string | null,
    restarts: [] as Array<{ resolve: () => void; reject: (e: Error) => void }>,
}))
vi.mock("@/electron/main/config-manager", () => ({
    applyPresetToEnv: (id: string) => {
        if (id === "missing") return null
        state.current = id
        return { AI_PROVIDER: id }
    },
    getAllPresets: () => [],
    getCurrentPresetId: () => state.current,
    setCurrentPreset: (id: string | null) => {
        state.current = id
        return true
    },
}))
vi.mock("@/electron/main/next-server", () => ({
    restartNextServer: () =>
        new Promise<void>((resolve, reject) =>
            state.restarts.push({ resolve, reject }),
        ),
}))
vi.mock("@/electron/main/menu-i18n", () => ({
    getMenuTranslations: () => new Proxy({}, { get: () => "x" }),
    getPreferredLocale: () => "en",
}))
vi.mock("@/electron/main/settings-window", () => ({
    showSettingsWindow: () => {},
}))

import { switchPreset } from "@/electron/main/app-menu"

beforeEach(() => {
    state.current = "A"
    state.restarts = []
})

describe("switchPreset", () => {
    it("keeps a preset chosen while a failed switch was restarting", async () => {
        const toB = switchPreset("B").catch(() => {})
        const toC = switchPreset("C")
        // B's restart fails after the user already picked C
        state.restarts[0].reject(new Error("timed out"))
        await new Promise((r) => setTimeout(r, 0))
        for (const r of state.restarts.slice(1)) r.resolve()
        await toB
        await toC
        expect(state.current).toBe("C")
    })

    it("keeps a newer choice of the same preset", async () => {
        // A, then B, C, and B again while the first restart is pending
        const first = switchPreset("B").catch(() => {})
        const second = switchPreset("C").catch(() => {})
        const third = switchPreset("B")
        // The first restart fails: the current preset is B again, but it is
        // the third switch's, which must not be undone
        state.restarts[0].reject(new Error("timed out"))
        await new Promise((r) => setTimeout(r, 0))
        for (const r of state.restarts.slice(1)) r.resolve()
        await first
        await second
        await third
        expect(state.current).toBe("B")
    })

    it("does not bring back the old preset over a deletion", async () => {
        const toB = switchPreset("B").catch(() => {})
        // B is deleted while its restart is pending
        state.current = null
        state.restarts[0].reject(new Error("timed out"))
        await toB
        expect(state.current).toBeNull()
        expect(state.restarts).toHaveLength(1)
    })

    it("still rolls back when a later request named no preset", async () => {
        const toB = switchPreset("B").catch(() => {})
        await expect(switchPreset("missing")).rejects.toThrow("not found")
        state.restarts[0].reject(new Error("timed out"))
        await new Promise((r) => setTimeout(r, 0))
        state.restarts[1]?.resolve()
        await toB
        expect(state.current).toBe("A")
    })
})
