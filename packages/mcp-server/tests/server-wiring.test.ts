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

import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs"
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

// A cell and a page as the model writes them
const box = (id: string, label: string, x = 40) =>
    `<mxCell id="${id}" value="${label}" x="${x}" y="40" w="120" h="60"/>`
const page = (id: string, name: string, cells: string) =>
    `<diagram id="${id}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
const addBox = (id: string, label: string) => ({
    operation: "add",
    cell_id: id,
    new_xml: box(id, label, 240),
})

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
        expect(line).toContain("pages: Flow (1 cell)")
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

    it("refuses restore_version without a session", async () => {
        const result = await callTool("restore_version", {})
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("start_session")
        // How to get back to the diagram of before a restart
        expect(textOf(result)).toContain("pass its session_id")
        expect(textOf(result)).toContain("list_saved_diagrams")
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
        // Only edit_diagram defaults to the first page
        expect(text).toContain("get_diagram and .drawio export take all pages")
        expect(text.length).toBeLessThanOrEqual(15000)
    })

    it("appends the user's instructions.md to the drawing guide", async () => {
        const text = textOf(await callTool("get_drawing_guide", {}))
        expect(
            text.endsWith(`\n\n## Custom Instructions\n${CUSTOM_RULE}`),
        ).toBe(true)
    })

    it("serves the table XML reference with topic=tables", async () => {
        const result = await callTool("get_drawing_guide", { topic: "tables" })
        expect(result.isError).toBeFalsy()
        const text = textOf(result)
        expect(text).toContain("shape=table")
        expect(text).not.toContain("Edge routing rules")
    })

    it("serves a diagram type's guide with topic=sequence, with the user's rules", async () => {
        const result = await callTool("get_drawing_guide", {
            topic: "sequence",
        })
        expect(result.isError).toBeFalsy()
        const text = textOf(result)
        expect(text).toContain("shape=umlLifeline")
        // Written for this server's tools
        expect(text).toContain("Now call create_new_diagram.")
        expect(text).not.toContain("Edge routing rules")
        expect(
            text.endsWith(`\n\n## Custom Instructions\n${CUSTOM_RULE}`),
        ).toBe(true)
    })

    it("names the topics when asked for one it does not have", async () => {
        const result = await callTool("get_drawing_guide", {
            topic: "flowchart",
        })
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain("sequence")
        expect(textOf(result)).toContain("tables")
    })

    it("lists the diagram types with a guide in the drawing guide", async () => {
        const text = textOf(await callTool("get_drawing_guide", {}))
        expect(text).toContain("topic=<type>")
        expect(text).toContain("(sequence, swimlane, usecase)")
    })
})

describe("load_diagram dual-source arguments", () => {
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
        const url = textOf(started).match(/Browser URL: (\S+)/)?.[1]
        expect(url).toBeDefined()
        // BROWSER=none: the reminder sits right under the link (#1058)
        expect(textOf(started)).toContain(
            `Browser URL: ${url}\nPut this link in your reply`,
        )
        const result = await callTool("get_selection", {})
        // Without the built shell (tests run before the build on CI and on
        // a fresh clone) start_session opens the classic page, which cannot
        // answer a selection request; the tool says so instead of waiting
        const shellBuilt = existsSync(
            path.join(__dirname, "../dist/shell/index.html"),
        )
        if (shellBuilt) {
            expect(result.isError).toBe(true)
            expect(textOf(result)).toContain(
                `Error: The preview tab is not open, or has not connected yet. Give the user the preview link ${url}`,
            )
        } else {
            expect(result.isError).toBeFalsy()
            expect(textOf(result)).toContain(
                "classic preview page cannot read the selection",
            )
        }
    })

    it("tells the model what each write did and that the outline is no part of the diagram", async () => {
        const created = textOf(
            await callTool("create_new_diagram", { xml: box("2", "A", 40) }),
        )
        expect(created).toContain("never edit the diagram to remove it")
        // Without a tab an image export fails at once and gives the link
        const exported = await callTool("export_diagram", {
            path: join(dataDir, "wiring.png"),
        })
        expect(exported.isError).toBe(true)
        expect(textOf(exported)).toMatch(
            /has not connected yet\. Give the user the preview link http:\/\/localhost:\d+\S*\?mcp=mcp-\S+ in your reply/,
        )
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
        // A file opened by path is saved back with export_diagram
        const path = join(dataDir, "flow.drawio")
        writeFileSync(path, SAVED_DIAGRAM)
        const loaded = textOf(await callTool("load_diagram", { path }))
        expect(loaded).toContain(`call export_diagram with path ${path}`)
    })

    it("adds notes to a write it repaired", async () => {
        const drawn = textOf(
            await callTool("create_new_diagram", {
                xml: '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/><mxCell id="5" source="2" target="33"/>',
            }),
        )
        expect(drawn).toContain(
            'Notes:\n- Drawn without the end that names no cell on this page: 5 (target "33").',
        )
        // Told once: a repair among the notes is not listed as auto-fixed too
        expect(drawn.split("Drawn without the end")).toHaveLength(2)
        expect(drawn).not.toContain("Auto-fixed")
        const edited = textOf(
            await callTool("edit_diagram", {
                operations: [
                    { operation: "delete", cell_id: "gone" },
                    {
                        operation: "add",
                        cell_id: "3",
                        new_xml:
                            '<mxCell id="3" value="B" parent="nope" x="240" y="40" w="120" h="60"/>',
                    },
                ],
            }),
        )
        expect(edited).toContain("Applied 2 operation(s)")
        expect(edited).toContain(
            "Notes:\n- delete gone: no cell with this id on the page",
        )
        expect(edited).toContain(
            '- Put on the page itself, as the parent is no cell on this page: 3 (parent "nope").',
        )
        expect(edited.split("Put on the page itself")).toHaveLength(2)
        const added = textOf(
            await callTool("add_page", {
                name: "Two",
                xml: '<mxCell id="7" source="8" target="9"/><mxCell id="8" value="C" x="40" y="40" w="120" h="60"/>',
            }),
        )
        expect(added).toContain(
            'Notes:\n- Drawn without the end that names no cell on this page: 7 (target "9").',
        )
        expect(added.split("Drawn without the end")).toHaveLength(2)
    })

    it("get_diagram and a .drawio export do not wait for a tab that never connected", async () => {
        const started = Date.now()
        const shown = textOf(await callTool("get_diagram", {}))
        const exported = textOf(
            await callTool("export_diagram", {
                path: join(dataDir, "no-wait.drawio"),
            }),
        )
        // Each waited 3 s for the tab's copy of the canvas
        expect(Date.now() - started).toBeLessThan(2000)
        expect(shown).toContain("<mxfile")
        expect(shown).toContain("is the preview tab open?")
        expect(exported).toContain("Diagram exported successfully!")
        expect(exported).toContain("is the preview tab open?")
    })

    it("advertises transparent on export_diagram", async () => {
        const props = await properties("export_diagram")
        const transparent = props.transparent as { type?: string } | undefined
        expect(transparent?.type).toBe("boolean")
    })

    it("shows an embedded picture as a reference and keeps it on a redraw", async () => {
        const data = `iVBORw0KGgo${"Q1".repeat(300)}AAAA==`
        const doc = `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="img" value="" style="shape=image;image=data:image/png,${data};" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="120" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        expect(
            (await callTool("load_diagram", { xml: doc })).isError,
        ).toBeFalsy()
        const shown = textOf(await callTool("get_diagram", {}))
        expect(shown).not.toContain(data)
        expect(shown).toContain("Keep a reference exactly as written")
        const cell = shown.match(/<mxCell id="img"[^>]*\/>/)?.[0] ?? ""
        expect(cell).toContain("embedded-image-")
        // Redrawn from the cell as it was shown
        const drawn = await callTool("create_new_diagram", { xml: cell })
        expect(drawn.isError).toBeFalsy()
        const file = path.join(dataDir, "redrawn.drawio")
        const exported = await callTool("export_diagram", { path: file })
        expect(exported.isError).toBeFalsy()
        const saved = readFileSync(file, "utf8")
        expect(saved).toContain(data)
        expect(saved).not.toContain("embedded-image-")
        // A new page started from the cell as it was shown
        const added = await callTool("add_page", { name: "Copy", xml: cell })
        expect(added.isError).toBeFalsy()
        const pageFile = path.join(dataDir, "copy.drawio")
        await callTool("export_diagram", { path: pageFile, page_name: "Copy" })
        expect(readFileSync(pageFile, "utf8")).toContain(data)
    }, 30000)

    it("puts a picture back from its reference after it left the document", async () => {
        // Another picture than the test above, which the server remembers
        const data = `iVBORw0KGgo${"Z9".repeat(300)}AAAA==`
        const doc = `<mxfile>${page("p1", "Page-1", `<mxCell id="img" value="" style="shape=image;image=data:image/png,${data};" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="120" as="geometry"/></mxCell>`)}</mxfile>`
        await callTool("load_diagram", { xml: doc })
        const shown = textOf(await callTool("get_diagram", {}))
        const cell = shown.match(/<mxCell id="img"[^>]*\/>/)?.[0] ?? ""
        expect(cell).toContain("embedded-image-")
        // A redraw in parts: the first part has no picture, so the picture
        // is in no document when its cell comes with the second part
        await callTool("create_new_diagram", { xml: box("2", "A", 240) })
        const added = await callTool("edit_diagram", {
            operations: [{ operation: "add", cell_id: "img", new_xml: cell }],
        })
        expect(added.isError).toBeFalsy()
        const file = join(dataDir, "picture-back.drawio")
        await callTool("export_diagram", { path: file })
        const saved = readFileSync(file, "utf8")
        expect(saved).toContain(data)
        expect(saved).not.toContain("embedded-image-")
    })

    it("exports into a folder that does not exist yet", async () => {
        const drawn = await callTool("create_new_diagram", {
            xml: '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/>',
        })
        expect(drawn.isError).toBeFalsy()
        const file = path.join(dataDir, "new", "folder", "out.drawio")
        const exported = await callTool("export_diagram", { path: file })
        expect(exported.isError).toBeFalsy()
        expect(readFileSync(file, "utf8")).toContain('value="A"')
    }, 30000)
})

describe("MCP server wiring: auto-fixed XML", () => {
    it("tells the model what it repaired in the XML of a write", async () => {
        // Two cells with id 3: the second gets a new id
        const drawn = textOf(
            await callTool("create_new_diagram", {
                xml: `${box("2", "Web")}${box("3", "API", 240)}${box("3", "Database", 440)}`,
            }),
        )
        expect(drawn).toContain(
            "Auto-fixed in your XML: Renamed duplicate ids (the first cell keeps its id; edges still name it): 3 to 3_dup1. Call get_diagram",
        )
        const edited = textOf(
            await callTool("edit_diagram", {
                operations: [
                    {
                        operation: "add",
                        cell_id: "4",
                        new_xml:
                            '<mxCell id="4" value="R & D" x="40" y="140" w="120" h="60"/>',
                    },
                ],
            }),
        )
        expect(edited).toContain(
            "Auto-fixed in your XML: 4: Escaped unescaped & characters.",
        )
        // Nothing to repair, nothing said
        const clean = textOf(
            await callTool("create_new_diagram", { xml: box("2", "Web") }),
        )
        expect(clean).not.toContain("Auto-fixed")
    })
})

describe("MCP server wiring: an operation without cell_id", () => {
    it("reads the id from new_xml, or says which operation has none", async () => {
        await callTool("create_new_diagram", { xml: box("2", "Web") })
        const edited = await callTool("edit_diagram", {
            operations: [
                addBox("3", "API"),
                {
                    operation: "add",
                    new_xml: '<mxCell id="4" source="2" target="3"/>',
                },
            ],
        })
        expect(edited.isError).toBeFalsy()
        expect(textOf(edited)).toContain("Applied 2 operation(s)")
        expect(textOf(await callTool("get_diagram", {}))).toContain(
            '<mxCell id="4" source="2" target="3"',
        )
        const missing = await callTool("edit_diagram", {
            operations: [{ operation: "delete" }],
        })
        expect(missing.isError).toBe(true)
        expect(textOf(missing)).toContain(
            "delete (operation 1 of 1): cell_id is missing",
        )
    })
})

describe("MCP server wiring: pages", () => {
    it("selects a page by a name with & and lists the pages when none matches", async () => {
        const drawn = await callTool("create_new_diagram", {
            xml: `<mxfile>${page("p1", "Overview", box("2", "A"))}${page("p2", "Lab", box("2", "B"))}</mxfile>`,
        })
        expect(drawn.isError).toBeFalsy()
        const renamed = await callTool("rename_page", {
            page_index: 1,
            new_name: "R&D",
        })
        expect(renamed.isError).toBeFalsy()
        const edited = await callTool("edit_diagram", {
            page_name: "R&D",
            operations: [addBox("3", "C")],
        })
        expect(textOf(edited)).toContain("Applied 1 operation(s)")
        expect(textOf(await callTool("list_pages", {}))).toContain(
            '[1] id="p2" name="R&D" cells=2',
        )
        const missing = await callTool("edit_diagram", {
            page_name: "Nope",
            operations: [addBox("4", "D")],
        })
        expect(missing.isError).toBe(true)
        expect(textOf(missing)).toContain(
            'Pages (2): [0] id=p1 name="Overview" cells=1 | [1] id=p2 name="R&D" cells=2',
        )
    })

    it("says when add_page or rename_page leaves two pages with one name", async () => {
        const first = textOf(await callTool("add_page", { name: "Data" }))
        expect(first).not.toContain("Note:")
        const second = textOf(await callTool("add_page", { name: "Data" }))
        expect(second).toContain(
            '2 pages are now named "Data", and page_name selects only the first one',
        )
        const renamed = textOf(
            await callTool("rename_page", { page_index: 0, new_name: "Data" }),
        )
        expect(renamed).toContain('3 pages are now named "Data"')
    })
})

describe("MCP server wiring: export_diagram", () => {
    it("refuses a format it cannot write, and names the file it wrote", async () => {
        await callTool("create_new_diagram", { xml: box("2", "A") })
        const pdf = join(dataDir, "report.pdf")
        const refused = await callTool("export_diagram", { path: pdf })
        expect(refused.isError).toBe(true)
        expect(textOf(refused)).toContain("cannot write .pdf files")
        expect(textOf(refused)).toContain(".drawio, .png, .svg and .drawio.svg")
        expect(existsSync(`${pdf}.drawio`)).toBe(false)
        // An extension made to match the format is named in the result
        const png = join(dataDir, "b.png")
        const renamed = textOf(
            await callTool("export_diagram", { path: png, format: "drawio" }),
        )
        expect(renamed).toContain(
            `File: ${png}.drawio\nNote: saved under this name, not as ${png}`,
        )
        const plain = textOf(
            await callTool("export_diagram", {
                path: join(dataDir, "c.drawio"),
            }),
        )
        expect(plain).not.toContain("saved under this name")
        // An empty path wrote a hidden file named ".drawio"
        const empty = await callTool("export_diagram", { path: "" }).catch(
            () => ({ isError: true }),
        )
        expect(empty.isError).toBe(true)
    })

    it("says that a .drawio file of one page leaves the other pages out", async () => {
        await callTool("create_new_diagram", {
            xml: `<mxfile>${page("p1", "Overview", box("2", "A"))}${page("p2", "Detail", box("2", "B"))}</mxfile>`,
        })
        const file = join(dataDir, "detail.drawio")
        const one = textOf(
            await callTool("export_diagram", { path: file, page_index: 1 }),
        )
        expect(one).toContain(
            "Note: this file holds only this page; the diagram has 2 pages. Export without a page selector to save all of them.",
        )
        expect(readFileSync(file, "utf8")).not.toContain("Overview")
        const all = textOf(await callTool("export_diagram", { path: file }))
        expect(all).not.toContain("holds only this page")
        expect(readFileSync(file, "utf8")).toContain("Overview")
    })
})

describe("MCP server wiring: restore_version", () => {
    it("tells a restored copy by the version it copies", async () => {
        await callTool("create_new_diagram", { xml: box("2", "A") })
        await callTool("edit_diagram", { operations: [addBox("3", "B")] })
        await callTool("edit_diagram", { operations: [addBox("4", "C")] })
        // Undo, then redo: History now ends with copies of both versions
        await callTool("restore_version", {})
        const redone = textOf(await callTool("restore_version", {}))
        // The version left is a copy of the edit that added B
        expect(redone).toContain(
            'steps_back=1 (the version you just left): AI change, added 1 shape; "Page-1" (2 cells)',
        )
        expect(redone).not.toContain("restored copy")
    })

    it("names a page rename in the list of versions", async () => {
        await callTool("create_new_diagram", { xml: box("2", "A") })
        await callTool("rename_page", { page_index: 0, new_name: "Overview" })
        const undone = textOf(await callTool("restore_version", {}))
        expect(undone).toContain(
            'steps_back=1 (the version you just left): renamed a page; "Overview" (1 cell)',
        )
    })

    it("lets an edit follow an undo back to a version the model drew", async () => {
        await callTool("create_new_diagram", { xml: box("2", "A") })
        await callTool("edit_diagram", { operations: [addBox("3", "B")] })
        const undone = textOf(await callTool("restore_version", {}))
        expect(undone).toContain("This is a version you drew")
        expect(undone).not.toContain("Call get_diagram before edit_diagram")
        // A new page and an edit of it: both were refused until the model
        // had read the whole document back
        const added = await callTool("add_page", {
            name: "Schema",
            xml: box("t1", "Table"),
        })
        expect(added.isError).toBeFalsy()
        const edited = await callTool("edit_diagram", {
            page_index: 1,
            operations: [
                {
                    operation: "update",
                    cell_id: "t1",
                    new_xml: box("t1", "Orders"),
                },
            ],
        })
        expect(textOf(edited)).toContain("Applied 1 operation(s)")
    })

    it("still asks for get_diagram after an undo back to a file the model never read", async () => {
        const file = join(dataDir, "unread.drawio")
        writeFileSync(file, SAVED_DIAGRAM)
        await callTool("load_diagram", { path: file })
        await callTool("create_new_diagram", { xml: box("2", "A") })
        const undone = textOf(await callTool("restore_version", {}))
        expect(undone).toContain("Call get_diagram before edit_diagram")
        const edited = await callTool("edit_diagram", {
            operations: [addBox("3", "B")],
        })
        expect(edited.isError).toBe(true)
        expect(textOf(edited)).toContain("You have not seen this diagram yet")
    })
})

describe("MCP server wiring: named styles follow the document", () => {
    const drawWith = (fill: string) =>
        callTool("create_new_diagram", {
            xml: `<mxStyle name="svc" value="fillColor=${fill};"/><mxCell id="2" value="A" style="svc;" x="40" y="40" w="120" h="60"/>`,
        })
    // The style of a cell added with the name, as get_diagram shows it
    const addedStyle = async (id: string) => {
        await callTool("edit_diagram", {
            operations: [
                {
                    operation: "add",
                    cell_id: id,
                    new_xml: `<mxCell id="${id}" value="B" style="svc;" x="240" y="40" w="120" h="60"/>`,
                },
            ],
        })
        const shown = textOf(await callTool("get_diagram", {}))
        return shown.match(new RegExp(`id="${id}"[^>]* style="([^"]*)"`))?.[1]
    }

    it("an undo brings back the definitions of the version it restores", async () => {
        await drawWith("#dae8fc")
        await drawWith("#f8cecc")
        expect(await addedStyle("3")).toContain("fillColor=#f8cecc")
        // Back over the edit and the second drawing, to the first one
        await callTool("restore_version", { steps_back: 2 })
        expect(await addedStyle("4")).toContain("fillColor=#dae8fc")
    })

    it("a file that is opened, and another session, start without them", async () => {
        await drawWith("#dae8fc")
        const file = join(dataDir, "styles.drawio")
        writeFileSync(file, SAVED_DIAGRAM)
        await callTool("load_diagram", { path: file })
        await callTool("get_diagram", {})
        expect(await addedStyle("b")).toBe("svc;whiteSpace=wrap;html=1;")
        await drawWith("#dae8fc")
        await callTool("start_session", {})
        await callTool("create_new_diagram", { xml: box("2", "A") })
        expect(await addedStyle("3")).toBe("svc;whiteSpace=wrap;html=1;")
    })
})

describe("MCP server wiring: start_session for the session in use", () => {
    it("keeps the session: no guide again, and the next edit needs no get_diagram", async () => {
        const started = textOf(await callTool("start_session", {}))
        const id = started.match(/Session ID: (\S+)/)?.[1]
        expect(started).toContain("Edge routing rules")
        await callTool("create_new_diagram", { xml: box("2", "A") })
        const again = textOf(
            await callTool("start_session", { session_id: id }),
        )
        expect(again).toContain(`Session ${id} is already active`)
        expect(again).toMatch(
            /Browser URL: http:\/\/localhost:\d+\S*\?mcp=mcp-/,
        )
        expect(again).toContain("Pages (1): [0] id=")
        expect(again).not.toContain("Edge routing rules")
        expect(again.length).toBeLessThan(700)
        // A new session object had forgotten what the model drew: the edit
        // was refused with "You have not seen this diagram yet"
        const edited = await callTool("edit_diagram", {
            operations: [addBox("3", "B")],
        })
        expect(textOf(edited)).toContain("Applied 1 operation(s)")
    })
})

// A server of its own: the one above runs with BROWSER=none. Linux only,
// where the display variables decide (macOS and Windows would open a tab)
describe.skipIf(process.platform !== "linux")(
    "start_session on Linux without a display",
    () => {
        it("gives the model the link instead of saying a tab opened", async () => {
            const env: Record<string, string> = {
                ...(process.env as Record<string, string>),
                DRAWIO_DATA_DIR: dataDir,
                PORT: String(6900 + Math.floor(Math.random() * 90)),
            }
            for (const name of [
                "BROWSER",
                "DISPLAY",
                "WAYLAND_DISPLAY",
                "WSL_DISTRO_NAME",
            ]) {
                delete env[name]
            }
            const headless = new Client({ name: "headless", version: "0.0.0" })
            await headless.connect(
                new StdioClientTransport({
                    command: tsxBin,
                    args: [entry],
                    env,
                    stderr: "ignore",
                }),
            )
            try {
                const text = textOf(
                    (await headless.callTool({
                        name: "start_session",
                        arguments: {},
                    })) as CallToolResult,
                )
                expect(text).toContain("Put this link in your reply")
                expect(text).toContain("Give the user the Browser URL above")
                expect(text).not.toContain("just opened")
            } finally {
                await headless.close()
            }
        }, 30000)
    },
)
