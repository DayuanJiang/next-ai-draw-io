// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const userData = vi.hoisted(() => ({ dir: "" }))
vi.mock("electron", () => ({
    app: { isPackaged: true, getPath: () => userData.dir },
}))

import { saveServerPort } from "@/electron/main/port-manager"

const savedPort = () =>
    JSON.parse(readFileSync(join(userData.dir, "server-port.json"), "utf-8"))
        .port

beforeEach(() => {
    userData.dir = mkdtempSync(join(tmpdir(), "port-manager-"))
})

describe("saveServerPort", () => {
    it("remembers the port of the first launch", () => {
        saveServerPort(13370)
        expect(savedPort()).toBe(13370)
    })

    it("keeps the remembered port when a launch had to use another", () => {
        // The app's data lives under the remembered port's origin; going
        // back to it once it is free brings the chats and settings back
        writeFileSync(
            join(userData.dir, "server-port.json"),
            JSON.stringify({ port: 61337 }),
        )
        saveServerPort(13371)
        expect(savedPort()).toBe(61337)
    })
})
