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
    noteNoChats,
    rememberChatPort,
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

describe("the port where chats were last saved", () => {
    it("opens there first", async () => {
        // Windows reserved 61337 for a while, and the user kept working
        storeData(61337)
        busy.ports[61337] = "EACCES"
        expect(await launch()).toBe(13370)
        storeData(13370)
        rememberChatPort()
        busy.ports = {}
        expect(await launch()).toBe(13370)
    })

    it("does not move after a launch elsewhere that saved nothing", async () => {
        storeData(61337)
        expect(await launch()).toBe(61337)
        rememberChatPort()
        busy.ports[61337] = "EADDRINUSE"
        expect(await launch()).toBe(13370)
        storeData(13370)
        busy.ports = {}
        expect(await launch()).toBe(61337)
    })

    it("never stores a last-resort port, which changes between launches", async () => {
        busy.ports[61337] = "EACCES"
        busy.ports[13370] = "EADDRINUSE"
        expect(await launch()).toBe(13371)
        rememberChatPort()
        busy.ports = {}
        expect(await launch()).toBe(61337)
    })

    it("tries the other port after opening on one without chats", async () => {
        // Split before this version: chats only on 13370, and a launch on
        // 61337 created that origin's folder
        storeData(13370)
        storeData(61337)
        expect(await launch()).toBe(61337)
        noteNoChats()
        expect(await launch()).toBe(13370)
        // Once a choice is stored, an empty page changes nothing
        noteNoChats()
        expect(await launch()).toBe(13370)
    })

    it("stays put for a new user", async () => {
        expect(await launch()).toBe(61337)
        noteNoChats()
        expect(await launch()).toBe(61337)
    })
})
