// @vitest-environment node
import { mkdirSync, mkdtempSync } from "node:fs"
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
} from "@/electron/main/port-manager"

/** Chats saved under http://127.0.0.1:<port>, as Electron stores them */
const storeData = (port: number) =>
    mkdirSync(
        join(
            userData.dir,
            "IndexedDB",
            `http_127.0.0.1_${port}.indexeddb.leveldb`,
        ),
        { recursive: true },
    )
const launch = () => findAvailablePort(false)

beforeEach(() => {
    userData.dir = mkdtempSync(join(tmpdir(), "port-manager-"))
    busy.ports = {}
    resetAllocatedPort()
})

describe("findAvailablePort", () => {
    it("uses the legacy port first, as main does", async () => {
        expect(await launch()).toBe(61337)
        storeData(61337)
        storeData(13370)
        expect(await launch()).toBe(61337)
    })

    it("uses 13370 when only it has the user's chats", async () => {
        // Windows reserved 61337 when they started using the app
        storeData(13370)
        expect(await launch()).toBe(13370)
    })

    it("goes back to the port with the chats once it is free", async () => {
        // The previous version still quitting after an update
        storeData(61337)
        busy.ports[61337] = "EADDRINUSE"
        expect(await launch()).toBe(13370)
        storeData(13370)
        busy.ports = {}
        expect(await launch()).toBe(61337)
    })

    it("does not hide the chats for good after one reserved launch", async () => {
        // Windows reserves port ranges per boot
        storeData(61337)
        busy.ports[61337] = "EACCES"
        expect(await launch()).toBe(13370)
        storeData(13370)
        busy.ports = {}
        expect(await launch()).toBe(61337)
    })

    it("falls back to the next ports", async () => {
        storeData(13370)
        busy.ports[13370] = "EADDRINUSE"
        expect(await launch()).toBe(61337)
        busy.ports[61337] = "EACCES"
        expect(await launch()).toBe(13371)
    })
})
