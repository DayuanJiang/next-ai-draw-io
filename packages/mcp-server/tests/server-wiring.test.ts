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
 * start_session is called only at the end, with BROWSER=none so no browser
 * window opens, for the tools that need a session but no preview tab. The
 * browser bridge is covered by the Playwright e2e suite.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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
    "load_diagram",
    "edit_diagram",
    "get_diagram",
    "export_diagram",
    "list_pages",
    "add_page",
    "rename_page",
    "delete_page",
    "get_drawing_guide",
    "get_shape_library",
    "screenshot_diagram",
    "get_selection",
    "list_saved_diagrams",
    "restore_version",
]

// Auto-save folder of the spawned server, holding one saved session
const dataDir = mkdtempSync(path.join(tmpdir(), "mcp-wiring-"))
const SAVED_ID = "mcp-aaaaaaaa-bbb"
const SAVED_DIAGRAM = `<mxfile><diagram id="p" name="Flow"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`

// Claude Code truncates tool descriptions and server instructions here
const MAX_DESCRIPTION = 2048

// The server reads <DRAWIO_DATA_DIR>/instructions.md into the guide; a
// developer's real ~/.next-ai-drawio/instructions.md must not leak in
const CUSTOM_RULE = "Always use blue fill #dae8fc."

let proc: ChildProcessWithoutNullStreams
let stdoutBuf = ""
const pending = new Map<
    number,
    { resolve: (m: any) => void; reject: (e: Error) => void; timeout: any }
>()
let nextId = 1
let initResp: any

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
    writeFileSync(path.join(dataDir, "instructions.md"), CUSTOM_RULE)
    writeFileSync(path.join(dataDir, `${SAVED_ID}.drawio`), SAVED_DIAGRAM)
    proc = spawn(tsxBin, [entry], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            DRAWIO_DATA_DIR: dataDir,
            // For the session tests at the end: no browser window, the
            // default preview (the canvas shell), a port away from other
            // servers
            BROWSER: "none",
            PORT: String(6500 + Math.floor(Math.random() * 400)),
        },
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

    initResp = await send("initialize", {
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
    rmSync(dataDir, { recursive: true, force: true })
})

describe("MCP server wiring", () => {
    it("registers all tools", async () => {
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

    it("advertises session_id on start_session", async () => {
        const resp = await send("tools/list", {})
        const start = resp.result.tools.find(
            (t: { name: string }) => t.name === "start_session",
        )
        expect(start?.inputSchema?.properties?.session_id).toBeTruthy()
        expect(start?.inputSchema?.required ?? []).not.toContain("session_id")
    })

    it("lists the saved diagrams with their pages, without a session", async () => {
        const resp = await send("tools/call", {
            name: "list_saved_diagrams",
            arguments: {},
        })
        expect(resp.result.isError).toBeFalsy()
        const text: string = resp.result.content[0].text
        const line = text.split("\n").find((l) => l.startsWith(SAVED_ID))
        expect(line, text).toBeTruthy()
        expect(line).toContain("pages: Flow (3 cells)")
        expect(line).toContain(path.join(dataDir, `${SAVED_ID}.drawio`))
        expect(line).not.toContain("(current)")
    })

    it("advertises screenshot on create_new_diagram and edit_diagram", async () => {
        const resp = await send("tools/list", {})
        for (const name of ["create_new_diagram", "edit_diagram"]) {
            const tool = resp.result.tools.find(
                (t: { name: string }) => t.name === name,
            )
            const props = tool?.inputSchema?.properties ?? {}
            expect(props.screenshot?.type, `${name} screenshot`).toBe("boolean")
        }
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

    it("advertises steps_back on restore_version", async () => {
        const resp = await send("tools/list", {})
        const restore = resp.result.tools.find(
            (t: { name: string }) => t.name === "restore_version",
        )
        expect(restore?.inputSchema?.properties?.steps_back).toBeTruthy()
    })

    it("refuses restore_version without a session", async () => {
        const resp = await send("tools/call", {
            name: "restore_version",
            arguments: {},
        })
        expect(resp.result.isError).toBe(true)
        expect(resp.result.content[0].text).toContain("start_session")
    })

    it("refuses get_selection without a session", async () => {
        const resp = await send("tools/call", {
            name: "get_selection",
            arguments: {},
        })
        expect(resp.result.isError).toBe(true)
        expect(resp.result.content[0].text).toContain("start_session")
    })

    it("keeps every description and the instructions within the host limit", async () => {
        const resp = await send("tools/list", {})
        for (const tool of resp.result.tools) {
            expect(
                tool.description.length,
                `${tool.name} description length`,
            ).toBeLessThanOrEqual(MAX_DESCRIPTION)
        }
        const instructions: string = initResp.result.instructions
        expect(instructions).toContain("start_session")
        expect(instructions.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    })

    it("serves a shape library without a session", async () => {
        const resp = await send("tools/call", {
            name: "get_shape_library",
            arguments: { library: "AWS4" },
        })
        expect(resp.result.isError).toBeFalsy()
        expect(resp.result.content[0].text).toContain("mxgraph.aws4")
    })

    it("reports an unknown shape library with the available names", async () => {
        const resp = await send("tools/call", {
            name: "get_shape_library",
            arguments: { library: "../secrets" },
        })
        expect(resp.result.isError).toBe(true)
        expect(resp.result.content[0].text).toContain("kubernetes")
    })

    it("serves the drawing guide without a session", async () => {
        const resp = await send("tools/call", {
            name: "get_drawing_guide",
            arguments: {},
        })
        const text: string = resp.result.content[0].text
        expect(text).toContain("Edge routing rules")
        expect(text).toContain("do not describe the diagram")
        expect(text).toContain("clear the canvas")
        expect(text.length).toBeLessThanOrEqual(15000)
    })

    it("appends the user's instructions.md to the drawing guide", async () => {
        const resp = await send("tools/call", {
            name: "get_drawing_guide",
            arguments: {},
        })
        const text: string = resp.result.content[0].text
        expect(
            text.endsWith(`\n\n## Custom Instructions\n${CUSTOM_RULE}`),
        ).toBe(true)
    })

    it("advertises topic on get_drawing_guide", async () => {
        const resp = await send("tools/list", {})
        const guide = resp.result.tools.find(
            (t: { name: string }) => t.name === "get_drawing_guide",
        )
        expect(guide?.inputSchema?.properties?.topic).toBeTruthy()
    })

    it("serves the table XML reference with topic=tables", async () => {
        const resp = await send("tools/call", {
            name: "get_drawing_guide",
            arguments: { topic: "tables" },
        })
        expect(resp.result.isError).toBeFalsy()
        const text: string = resp.result.content[0].text
        expect(text).toContain("shape=table")
        expect(text).not.toContain("Edge routing rules")
    })
})

describe("load_diagram dual-source arguments", () => {
    it("advertises both optional 'path' and 'xml' sources", async () => {
        const resp = await send("tools/list", {})
        const load = resp.result.tools.find(
            (t: { name: string }) => t.name === "load_diagram",
        )
        const props = load?.inputSchema?.properties ?? {}
        expect(props.path).toBeTruthy()
        expect(props.xml).toBeTruthy()
        const required: string[] = load?.inputSchema?.required ?? []
        expect(required).not.toContain("path")
        expect(required).not.toContain("xml")
    })

    it("rejects passing both 'path' and 'xml'", async () => {
        // Argument validation fires before the session check: no session
        // exists in this harness, so a both-args call must report the
        // mutual-exclusion error, not "No active session".
        const resp = await send("tools/call", {
            name: "load_diagram",
            arguments: { path: "/tmp/x.drawio", xml: "<mxfile/>" },
        })
        expect(resp.error, JSON.stringify(resp.error)).toBeUndefined()
        expect(resp.result?.isError).toBe(true)
        expect(resp.result?.content?.[0]?.text).toContain("not both")
    })

    it("rejects passing neither 'path' nor 'xml'", async () => {
        const resp = await send("tools/call", {
            name: "load_diagram",
            arguments: {},
        })
        expect(resp.result?.isError).toBe(true)
        expect(resp.result?.content?.[0]?.text).toContain("either 'path'")
    })

    it("accepts 'xml' alone as a source (fails only on the missing session)", async () => {
        const resp = await send("tools/call", {
            name: "load_diagram",
            arguments: {
                xml: '<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
            },
        })
        expect(resp.result?.isError).toBe(true)
        expect(resp.result?.content?.[0]?.text).toContain("No active session")
    })
})

// After the tests above: start_session makes a session current
describe("MCP server wiring with a session, without a preview tab", () => {
    it("get_selection says the preview tab is not connected", async () => {
        const started = await send("tools/call", {
            name: "start_session",
            arguments: {},
        })
        expect(started.result.isError).toBeFalsy()
        expect(started.result.content[0].text).toContain("Browser URL:")
        const resp = await send("tools/call", {
            name: "get_selection",
            arguments: {},
        })
        // Without the built shell (tests run before the build on CI and on
        // a fresh clone) start_session opens the classic page, which cannot
        // answer a selection request; the tool says so instead of waiting
        const shellBuilt = existsSync(
            path.join(__dirname, "../dist/shell/index.html"),
        )
        if (shellBuilt) {
            expect(resp.result.isError).toBe(true)
            expect(resp.result.content[0].text).toBe(
                "Error: The preview tab is not open, or has not connected yet.",
            )
        } else {
            expect(resp.result.isError).toBeFalsy()
            expect(resp.result.content[0].text).toContain(
                "classic preview page cannot read the selection",
            )
        }
    })
})
