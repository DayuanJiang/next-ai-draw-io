// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const userData = vi.hoisted(() => ({ dir: "" }))
vi.mock("electron", () => ({
    app: { isPackaged: true, getPath: () => userData.dir },
}))

// Ports that fail to listen, with the error code
const busy = vi.hoisted(() => ({ ports: {} as Record<number, string> }))
vi.mock("node:net", () => ({
    default: {
        createServer: () => {
            const handlers: Record<string, (arg?: unknown) => void> = {}
            const server = {
                once: (event: string, cb: (arg?: unknown) => void) => {
                    handlers[event] = cb
                    return server
                },
                listen: (port: number) => {
                    const code = busy.ports[port]
                    if (code) handlers.error?.({ code })
                    else handlers.listening?.()
                },
                close: () => {},
            }
            return server
        },
    },
}))

import {
    findAvailablePort,
    resetAllocatedPort,
    saveServerPort,
} from "@/electron/main/port-manager"

const portFile = () => join(userData.dir, "server-port.json")
const savedPort = () => JSON.parse(readFileSync(portFile(), "utf-8")).port

/** One launch: pick a port, start on it, remember it if it should be */
async function launch() {
    const port = await findAvailablePort(false)
    saveServerPort(port)
    return port
}

beforeEach(() => {
    userData.dir = mkdtempSync(join(tmpdir(), "port-manager-"))
    busy.ports = {}
    resetAllocatedPort()
})

describe("saveServerPort", () => {
    it("remembers the legacy port of the first launch", async () => {
        expect(await launch()).toBe(61337)
        expect(savedPort()).toBe(61337)
    })

    it("remembers 13370 when the system reserves the legacy port", async () => {
        // Windows excludes port ranges for Hyper-V, which can change on
        // each boot
        busy.ports[61337] = "EACCES"
        expect(await launch()).toBe(13370)
        expect(savedPort()).toBe(13370)
    })

    it("does not remember a port used while the legacy port was in use", async () => {
        // For example the previous version still quitting after an update:
        // the user's data is under 61337, so the next launch tries it again
        busy.ports[61337] = "EADDRINUSE"
        expect(await launch()).toBe(13370)
        expect(existsSync(portFile())).toBe(false)

        busy.ports = {}
        expect(await launch()).toBe(61337)
        expect(savedPort()).toBe(61337)
    })

    it("does not remember a fallback port", async () => {
        busy.ports[61337] = "EACCES"
        busy.ports[13370] = "EADDRINUSE"
        expect(await launch()).toBe(13371)
        expect(existsSync(portFile())).toBe(false)
    })

    it("keeps the remembered port when a launch had to use another", () => {
        // The app's data lives under the remembered port's origin; going
        // back to it once it is free brings the chats and settings back
        writeFileSync(portFile(), JSON.stringify({ port: 61337 }))
        saveServerPort(13371)
        expect(savedPort()).toBe(61337)
    })
})
