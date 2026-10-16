/**
 * Server-wiring test: boot the actual MCP stdio server (from source via tsx)
 * and drive it with the SDK's own client — initialize handshake, tools/list,
 * tools/call — to catch registration/schema regressions that the unit tests
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

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path, { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
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

let client: Client

const listTools = async () => (await client.listTools()).tools
const findTool = async (name: string) =>
    (await listTools()).find((t) => t.name === name)
const properties = async (name: string) =>
    (await findTool(name))?.inputSchema?.properties ?? {}

/** A tool call's result; the SDK throws on a JSON-RPC error */
const callTool = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult
const textOf = (result: CallToolResult) =>
    (result.content[0] as { text: string }).text

beforeAll(async () => {
    writeFileSync(path.join(dataDir, "instructions.md"), CUSTOM_RULE)
    writeFileSync(path.join(dataDir, `${SAVED_ID}.drawio`), SAVED_DIAGRAM)
    client = new Client({ name: "wiring-test", version: "0.0.0" })
    await client.connect(
        new StdioClientTransport({
            command: tsxBin,
            args: [entry],
            env: {
                ...process.env,
                DRAWIO_DATA_DIR: dataDir,
                // For the session tests at the end: no browser window, the
                // default preview (the canvas shell), a port away from other
                // servers
                BROWSER: "none",
                PORT: String(6500 + Math.floor(Math.random() * 400)),
            } as Record<string, string>,
            // The server's log lines
            stderr: "ignore",
        }),
    )
    expect(client.getServerVersion()?.name).toBeTruthy()
}, 30000)

afterAll(async () => {
    await client?.close()
    rmSync(dataDir, { recursive: true, force: true })
})

describe("MCP server wiring", () => {
    it("registers all tools", async () => {
        const names = (await listTools()).map((t) => t.name)
        for (const expected of EXPECTED_TOOLS) {
            expect(names, `missing tool: ${expected}`).toContain(expected)
        }
    })

    it("advertises page-selector params on edit_diagram", async () => {
        const props = await properties("edit_diagram")
        expect(props.page_id).toBeTruthy()
        expect(props.page_name).toBeTruthy()
        expect(props.page_index).toBeTruthy()
    })

    it("advertises session_id on start_session", async () => {
        const start = await findTool("start_session")
        expect(start?.inputSchema?.properties?.session_id).toBeTruthy()
        expect(start?.inputSchema?.required ?? []).not.toContain("session_id")
    })

    it("lists the saved diagrams with their pages, without a session", async () => {
        const result = await callTool("list_saved_diagrams", {})
        expect(result.isError).toBeFalsy()
        const text = textOf(result)
        const line = text.split("\n").find((l) => l.startsWith(SAVED_ID))
        expect(line, text).toBeTruthy()
        expect(line).toContain("pages: Flow (3 cells)")
        expect(line).toContain(path.join(dataDir, `${SAVED_ID}.drawio`))
        expect(line).not.toContain("(current)")
    })

    it("advertises screenshot on create_new_diagram and edit_diagram", async () => {
        for (const name of ["create_new_diagram", "edit_diagram"]) {
            const props = await properties(name)
            const screenshot = props.screenshot as { type?: string } | undefined
            expect(screenshot?.type, `${name} screenshot`).toBe("boolean")
        }
    })

    it("advertises name/id/xml on add_page", async () => {
        const props = await properties("add_page")
        expect(props.name).toBeTruthy()
        expect(props.id).toBeTruthy()
        expect(props.xml).toBeTruthy()
    })

    it("advertises steps_back on restore_version", async () => {
        const props = await properties("restore_version")
        expect(props.steps_back).toBeTruthy()
    })

    it("refuses restore_version without a session", async () => {
        const result = await callTool("restore_version", {})
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("start_session")
    })

    it("refuses get_selection without a session", async () => {
        const result = await callTool("get_selection", {})
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("start_session")
    })

    it("keeps every description and the instructions within the host limit", async () => {
        for (const tool of await listTools()) {
            expect(
                tool.description?.length,
                `${tool.name} description length`,
            ).toBeLessThanOrEqual(MAX_DESCRIPTION)
        }
        const instructions = client.getInstructions() ?? ""
        expect(instructions).toContain("start_session")
        expect(instructions.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    })

    it("serves a shape library without a session", async () => {
        const result = await callTool("get_shape_library", { library: "AWS4" })
        expect(result.isError).toBeFalsy()
        expect(textOf(result)).toContain("mxgraph.aws4")
    })

    it("reports an unknown shape library with the available names", async () => {
        const result = await callTool("get_shape_library", {
            library: "../secrets",
        })
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("kubernetes")
    })

    it("serves the drawing guide without a session", async () => {
        const text = textOf(await callTool("get_drawing_guide", {}))
        expect(text).toContain("Edge routing rules")
        expect(text).toContain("do not describe the diagram")
        expect(text).toContain("clear the canvas")
        expect(text.length).toBeLessThanOrEqual(15000)
    })

    it("appends the user's instructions.md to the drawing guide", async () => {
        const text = textOf(await callTool("get_drawing_guide", {}))
        expect(
            text.endsWith(`\n\n## Custom Instructions\n${CUSTOM_RULE}`),
        ).toBe(true)
    })

    it("advertises topic on get_drawing_guide", async () => {
        const props = await properties("get_drawing_guide")
        expect(props.topic).toBeTruthy()
    })

    it("serves the table XML reference with topic=tables", async () => {
        const result = await callTool("get_drawing_guide", { topic: "tables" })
        expect(result.isError).toBeFalsy()
        const text = textOf(result)
        expect(text).toContain("shape=table")
        expect(text).not.toContain("Edge routing rules")
    })
})

describe("load_diagram dual-source arguments", () => {
    it("advertises both optional 'path' and 'xml' sources", async () => {
        const load = await findTool("load_diagram")
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
        const result = await callTool("load_diagram", {
            path: "/tmp/x.drawio",
            xml: "<mxfile/>",
        })
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("not both")
    })

    it("rejects passing neither 'path' nor 'xml'", async () => {
        const result = await callTool("load_diagram", {})
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("either 'path'")
    })

    it("accepts 'xml' alone as a source (fails only on the missing session)", async () => {
        const result = await callTool("load_diagram", {
            xml: '<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
        })
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("No active session")
    })
})

// After the tests above: start_session makes a session current
describe("MCP server wiring with a session, without a preview tab", () => {
    it("get_selection says the preview tab is not connected", async () => {
        const started = await callTool("start_session", {})
        expect(started.isError).toBeFalsy()
        expect(textOf(started)).toContain("Browser URL:")
        const result = await callTool("get_selection", {})
        // Without the built shell (tests run before the build on CI and on
        // a fresh clone) start_session opens the classic page, which cannot
        // answer a selection request; the tool says so instead of waiting
        const shellBuilt = existsSync(
            path.join(__dirname, "../dist/shell/index.html"),
        )
        if (shellBuilt) {
            expect(result.isError).toBe(true)
            expect(textOf(result)).toBe(
                "Error: The preview tab is not open, or has not connected yet.",
            )
        } else {
            expect(result.isError).toBeFalsy()
            expect(textOf(result)).toContain(
                "classic preview page cannot read the selection",
            )
        }
    })

    it("tells the model what each write did and that the outline is no part of the diagram", async () => {
        const box = (id: string, label: string, x: number) =>
            `<mxCell id="${id}" value="${label}" x="${x}" y="40" w="120" h="60"/>`
        const created = textOf(
            await callTool("create_new_diagram", { xml: box("2", "A", 40) }),
        )
        expect(created).toContain("never edit the diagram to remove it")
        // An update that sends the cell as it is changes nothing
        const edited = textOf(
            await callTool("edit_diagram", {
                operations: [
                    {
                        operation: "update",
                        cell_id: "2",
                        new_xml: box("2", "A", 40),
                    },
                    {
                        operation: "add",
                        cell_id: "3",
                        new_xml: box("3", "B", 240),
                    },
                ],
            }),
        )
        expect(edited).toContain(
            "1 of them changed nothing (id 2 already matched)",
        )
        const added = textOf(await callTool("add_page", { name: "Sequence" }))
        expect(added).toContain('The first page is still called "Page-1"')
        // restore_version names who made each version and what it changed:
        // back to the first drawing, two steps
        const restored = textOf(
            await callTool("restore_version", { steps_back: 2 }),
        )
        expect(restored).toContain(
            "steps_back=1 (the version you just left): added a page;",
        )
        expect(restored).toContain("steps_back=2: AI change, added 1 shape;")
        // A file opened by path is saved back with export_diagram (which,
        // like get_diagram, waits for the preview tab this test has not)
        const path = join(dataDir, "flow.drawio")
        writeFileSync(path, SAVED_DIAGRAM)
        const loaded = textOf(await callTool("load_diagram", { path }))
        expect(loaded).toContain(`call export_diagram with path ${path}`)
    })

    it("advertises transparent on export_diagram", async () => {
        const props = await properties("export_diagram")
        const transparent = props.transparent as { type?: string } | undefined
        expect(transparent?.type).toBe("boolean")
    })
})
