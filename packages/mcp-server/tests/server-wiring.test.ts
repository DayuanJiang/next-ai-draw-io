/**
 * Server-wiring test: boot the actual MCP stdio server (from source via tsx)
 * and drive it the way a real MCP client does — initialize handshake,
 * tools/list — to catch registration/schema regressions that the unit tests
 * (which import helpers directly) can't see.
 *
 * This replaces the old standalone tests/smoke.mjs, which spawned the BUILT
 * dist/index.js and was therefore never run in CI (CI doesn't build this
 * package before testing). Running from source via tsx means it executes as
 * part of the normal `vitest run`.
 *
 * We deliberately do NOT call start_session — it would open a real browser
 * window via open(). The browser bridge is covered by the Playwright e2e suite.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const entry = path.resolve(__dirname, "..", "src", "index.ts")
const tsxBin = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
)

const EXPECTED_TOOLS = [
    "start_session",
    "create_new_diagram",
    "edit_diagram",
    "get_diagram",
    "export_diagram",
    "list_pages",
    "add_page",
    "rename_page",
    "delete_page",
]

let proc: ChildProcessWithoutNullStreams
let stdoutBuf = ""
const pending = new Map<
    number,
    { resolve: (m: any) => void; reject: (e: Error) => void; timeout: any }
>()
let nextId = 1

function send(method: string, params: unknown, isNotification = false) {
    const msg: Record<string, unknown> = { jsonrpc: "2.0", method, params }
    if (!isNotification) msg.id = nextId++
    proc.stdin.write(`${JSON.stringify(msg)}\n`)
    if (isNotification) return Promise.resolve(undefined)
    return new Promise<any>((resolve, reject) => {
        const id = msg.id as number
        const timeout = setTimeout(() => {
            pending.delete(id)
            reject(new Error(`Timed out waiting for response to ${method}`))
        }, 15000)
        pending.set(id, { resolve, reject, timeout })
    })
}

beforeAll(async () => {
    proc = spawn(tsxBin, [entry], {
        stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams

    proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
        const lines = stdoutBuf.split("\n")
        stdoutBuf = lines.pop() || ""
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            let msg: any
            try {
                msg = JSON.parse(trimmed)
            } catch {
                // Non-JSON-RPC log line — ignore.
                continue
            }
            const p = msg.id !== undefined ? pending.get(msg.id) : undefined
            if (p) {
                clearTimeout(p.timeout)
                pending.delete(msg.id)
                p.resolve(msg)
            }
        }
    })

    const initResp = await send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "wiring-test", version: "0.0.0" },
    })
    expect(initResp.error, JSON.stringify(initResp.error)).toBeUndefined()
    expect(initResp.result?.serverInfo?.name).toBeTruthy()
    await send("notifications/initialized", {}, true)
}, 30000)

afterAll(() => {
    proc?.kill("SIGTERM")
})

describe("MCP server wiring", () => {
    it("registers all nine multi-page tools", async () => {
        const resp = await send("tools/list", {})
        expect(resp.error, JSON.stringify(resp.error)).toBeUndefined()
        const names: string[] = (resp.result?.tools ?? []).map(
            (t: { name: string }) => t.name,
        )
        for (const expected of EXPECTED_TOOLS) {
            expect(names, `missing tool: ${expected}`).toContain(expected)
        }
    })

    it("advertises page-selector params on edit_diagram", async () => {
        const resp = await send("tools/list", {})
        const edit = resp.result.tools.find(
            (t: { name: string }) => t.name === "edit_diagram",
        )
        const props = edit?.inputSchema?.properties ?? {}
        expect(props.page_id).toBeTruthy()
        expect(props.page_name).toBeTruthy()
        expect(props.page_index).toBeTruthy()
    })

    it("advertises name/id/xml on add_page", async () => {
        const resp = await send("tools/list", {})
        const addPage = resp.result.tools.find(
            (t: { name: string }) => t.name === "add_page",
        )
        const props = addPage?.inputSchema?.properties ?? {}
        expect(props.name).toBeTruthy()
        expect(props.id).toBeTruthy()
        expect(props.xml).toBeTruthy()
    })
})
