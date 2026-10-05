#!/usr/bin/env node
/**
 * MCP Server for Next AI Draw.io
 *
 * Enables AI agents (Claude Desktop, Cursor, etc.) to generate and edit
 * draw.io diagrams with real-time browser preview.
 *
 * Uses an embedded HTTP server - no external dependencies required.
 *
 * Multi-page support
 * ------------------
 * The canonical in-memory shape for the session XML is always an <mxfile>
 * containing one or more <diagram> pages. Legacy callers that pass a bare
 * <mxGraphModel> to create_new_diagram are auto-wrapped into a single-page
 * mxfile. All page-targeting parameters (page_id / page_name / page_index)
 * on edit_diagram, get_diagram, and export_diagram are optional and default
 * to the first page. See packages/mcp-server/src/pages.ts for the helper
 * surface.
 */

import { createRequire } from "node:module"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import open from "open"
import { z } from "zod"
import type { DiagramOperation } from "./diagram-operations.ts"
import { installDomPolyfill } from "./dom.ts"
import { DRAWING_GUIDE } from "./drawing-guide.ts"
import { editDiagram, targetPageXml } from "./edit-diagram.ts"
import { checkEditGate, markPageSeen } from "./edit-gate.ts"
import { createExclusive } from "./exclusive.ts"
import { addHistory } from "./history.ts"
import {
    type ExportFormat,
    type ExportOptions,
    getServerPort,
    getState,
    keepInHistory,
    onSessionRecreate,
    onStateChange,
    requestExport,
    requestSync,
    restoreSavedSession,
    setState,
    shutdown,
    startHttpServer,
    waitForSync,
} from "./http-server.ts"
import { parseDrawioFileContent } from "./load-diagram.ts"
import { log } from "./logger.ts"
import { prepareNewDiagram, reservedIdError } from "./new-diagram.ts"
import {
    addPageToDoc,
    deletePageFromDoc,
    findPageElement,
    hasCells,
    hasPageSelector,
    listPagesFromDoc,
    normalizeToMxfile,
    type PageSelector,
    parseMxfile,
    projectPage,
    renamePageInDoc,
    serializeMxfile,
    wrapCellsInModel,
} from "./pages.ts"
import { Autosaver, defaultDataDir, expandHome } from "./persistence.ts"
import { getShapeLibrary, SHAPE_LIBRARY_LIST } from "./shape-library.ts"
import { validateAndFixXml } from "./xml-validation.ts"

// DOMParser/XMLSerializer globals for the XML helpers (Node has neither)
installDomPolyfill()

// Server configuration
const config = {
    port: parseInt(process.env.PORT || "6002", 10),
}

// Keep each session's latest diagram on disk, so it survives this process
const autosaver = new Autosaver(defaultDataDir())
onStateChange((sessionId, xml) => autosaver.schedule(sessionId, xml))
onSessionRecreate((sessionId) => autosaver.load(sessionId))

// A one-page view that does not count for the whole document (edit-gate.ts)
const OTHER_PAGES_UNSEEN =
    "You have not seen the other pages in their current state."

/**
 * The browser's state of a session. After it expired (or the process
 * restarted) the saved file comes back first, so a tool never builds on an
 * older copy and then overwrites the file. Call it before requestSync or
 * requestExport, which need the state.
 */
function sessionState(sessionId: string) {
    restoreSavedSession(sessionId)
    return getState(sessionId)
}

// Session state (single session for simplicity)
let currentSession: {
    id: string
    xml: string
    version: number
    // The exact state-store XML the model last saw (get_diagram) or wrote
    // itself (create/edit/page CRUD). The store only changes on server
    // writes or browser pushes (user autosave / sync), so edit_diagram can
    // detect unseen user edits by comparing the live store against this.
    // Empty = no diagram context established yet.
    lastSeenXml: string
} | null = null

// Create MCP server. The version reported in the MCP handshake is read from
// package.json so it can never drift from the published npm version again
// (it sat hardcoded at stale values for most of this package's history).
// Both src/ (tsx dev) and dist/ (published build) live one level below the
// package root, so the relative path works in either runtime.
const require = createRequire(import.meta.url)
const packageVersion: string = require("../package.json").version

// Hosts truncate instructions (Claude Code at 2,048 characters) and may show
// only the first 512, so the essentials come first. The full rules are in
// DRAWING_GUIDE, returned by start_session.
const INSTRUCTIONS = `next-ai-drawio creates and edits draw.io diagrams and shows them live in a browser preview, where the user can also edit them by hand.

Start with start_session: it opens the preview and its result contains the drawing guide (layout, edge routing and style rules). Follow the guide when drawing; call get_drawing_guide if it is no longer in your context.

Before using cloud or icon shapes (AWS, Azure, GCP, Kubernetes, Cisco, BPMN...), call get_shape_library and use the exact style names it returns. Never guess icon style names.

After drawing a complex diagram, call screenshot_diagram once to see it, and fix overlapping shapes or edges that cross shapes.

Tools:
- create_new_diagram: draw a new diagram, replacing the whole document. Send only the mxCell elements of one page (the server adds the wrapper and root cells), or a full <mxfile> for several pages.
- edit_diagram: add, update or delete cells of an existing page by id. All-or-nothing; a rejected call includes the current XML so you can retry.
- get_diagram: read the current XML, including the user's manual edits.
- screenshot_diagram: see the rendered diagram as an image.
- load_diagram, export_diagram: open or save .drawio files and export .png or .svg. Use absolute paths.
- list_pages, add_page, rename_page, delete_page: manage pages (tabs).`

const server = new McpServer(
    {
        name: "next-ai-drawio",
        version: packageVersion,
    },
    { instructions: INSTRUCTIONS },
)

// The tools that write the diagram, and start_session, run one at a time:
// two writes at once would both build on the same document, and the second
// would drop the first one's change. start_session in the queue keeps a
// session switch from landing in the middle of a write.
const exclusive = createExclusive()
const registerWriteTool = ((name: string, config: any, handler: any) =>
    server.registerTool(
        name,
        config,
        exclusive(handler),
    )) as typeof server.registerTool

// Shared Zod schema fragment for page-targeting parameters.
// Every multi-page-aware tool reuses these three optional fields so the LLM
// learns one consistent interface.
const pageSelectorSchema = {
    page_id: z
        .string()
        .min(1)
        .optional()
        .describe(
            "Target a page by its id (as returned by list_pages or add_page). Wins over page_name and page_index when multiple are set.",
        ),
    page_name: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Target a page by its display name (e.g. "CNN"). Used only when page_id is not set.',
        ),
    page_index: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
            "Target a page by its 0-based tab index. Used only when page_id and page_name are not set.",
        ),
}

/**
 * Pull a clean PageSelector out of a tool's parsed input.
 * Returns an empty object when none of the page_* fields are set, so callers
 * can simply pass it through to the lower layers (they treat empty as "first
 * page" by convention).
 */
function pickPageSelector(input: {
    page_id?: string
    page_name?: string
    page_index?: number
}): PageSelector {
    const selector: PageSelector = {}
    if (input.page_id) selector.page_id = input.page_id
    if (input.page_name) selector.page_name = input.page_name
    if (input.page_index !== undefined) selector.page_index = input.page_index
    return selector
}

/** Format a selector for human-readable error messages. */
function describeSelector(s: PageSelector): string {
    if (s.page_id) return `id="${s.page_id}"`
    if (s.page_name) return `name="${s.page_name}"`
    if (s.page_index !== undefined) return `index=${s.page_index}`
    return "first page"
}

// The same guide as start_session, for hosts that show prompts to the user
server.registerPrompt(
    "diagram-workflow",
    {
        description: "Guidelines for creating and editing draw.io diagrams",
    },
    () => ({
        messages: [
            {
                role: "user",
                content: { type: "text", text: DRAWING_GUIDE },
            },
        ],
    }),
)

// Tool: get_drawing_guide
server.registerTool(
    "get_drawing_guide",
    {
        title: "Get drawing guide",
        description:
            "Return the drawing guide: XML format, layout, edge routing, style and editing rules. " +
            "start_session already returns it; call this only if the guide is no longer in your context.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: "text", text: DRAWING_GUIDE }] }),
)

// Tool: get_shape_library
server.registerTool(
    "get_shape_library",
    {
        title: "Get shape library",
        description:
            "Get the style syntax and shape names of a draw.io icon library. Call this BEFORE drawing with " +
            "cloud, network or other icon shapes, and use the exact names it returns; never guess them.\n\n" +
            `Libraries:\n${SHAPE_LIBRARY_LIST}`,
        inputSchema: {
            library: z
                .string()
                .describe("Library name, e.g. aws4, kubernetes, flowchart"),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ library }) => {
        const found = await getShapeLibrary(library)
        return found.ok
            ? { content: [{ type: "text", text: found.text }] }
            : {
                  content: [{ type: "text", text: `Error: ${found.error}` }],
                  isError: true,
              }
    },
)

// Tool: start_session
registerWriteTool(
    "start_session",
    {
        title: "Start session",
        description:
            "Start a new diagram session and open the browser for real-time preview. " +
            "Starts an embedded server and opens a browser window with draw.io. " +
            "The browser will show diagram updates as they happen. " +
            "The result includes the drawing guide; follow it when drawing.",
        inputSchema: {},
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async () => {
        try {
            // Start embedded HTTP server
            const port = await startHttpServer(config.port)

            // Create session
            const sessionId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
            currentSession = {
                id: sessionId,
                xml: "",
                version: 0,
                lastSeenXml: "",
            }

            // Open browser
            const browserUrl = `http://localhost:${port}?mcp=${sessionId}`
            await open(browserUrl)

            const savePath = autosaver.pathFor(sessionId)
            const saveNote = savePath
                ? `\n\nAuto-save: after every change the diagram is saved to ${savePath}. To continue it in a later conversation, call start_session, then load_diagram with this path.`
                : ""

            log.info(`Started session ${sessionId}, browser at ${browserUrl}`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Session started successfully!\n\nSession ID: ${sessionId}\nBrowser URL: ${browserUrl}\n\nThe browser will now show real-time diagram updates.${saveNote}\n\n${DRAWING_GUIDE}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("start_session failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: create_new_diagram
registerWriteTool(
    "create_new_diagram",
    {
        title: "Create new diagram",
        description: `Create a NEW diagram, REPLACING the whole document: every page and any unsaved user changes (the previous state stays in History). To add a tab use add_page; to change cells use edit_diagram.

Before using icon shapes (AWS, Azure, GCP, Kubernetes, Cisco...), call get_shape_library first. Follow the drawing guide returned by start_session (call get_drawing_guide if it is no longer in your context).

Accepted xml:
1) Only the mxCell elements of one page (recommended). The server adds <mxfile>, <mxGraphModel>, <root> and the root cells "0" and "1":
<mxCell id="2" value="Shape" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
2) A bare <mxGraphModel> with <root> (one page).
3) A full <mxfile> with one or more <diagram> pages. Every page's <root> must start with <mxCell id="0"/><mxCell id="1" parent="0"/>.

Rules: cells are siblings (never nested), ids are unique per page and start from "2", parent="1" for top-level shapes, no XML comments, and shapes stay within x 0 to 800 and y 0 to 600.`,
        inputSchema: {
            xml: z
                .string()
                .describe(
                    "REQUIRED: the mxCell elements of one page, a bare <mxGraphModel>, or a full <mxfile> with one or more <diagram> pages.",
                ),
        },
        annotations: { openWorldHint: false },
    },
    async ({ xml: inputXml }) => {
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Please call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            const prepared = prepareNewDiagram(inputXml)
            if (!prepared.ok) {
                log.error(prepared.error)
                return {
                    content: [
                        { type: "text", text: `Error: ${prepared.error}` },
                    ],
                    isError: true,
                }
            }
            if (prepared.fixes.length > 0) {
                log.info(`XML auto-fixed: ${prepared.fixes.join(", ")}`)
            }
            // Every later tool can assume session.xml is an mxfile
            const xml = prepared.xml

            log.info(`Setting diagram content, ${xml.length} chars`)

            // Sync from browser state first
            const browserState = sessionState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }

            // Save user's state before AI overwrites (with cached SVG)
            if (currentSession.xml) {
                keepInHistory(
                    currentSession.id,
                    currentSession.xml,
                    browserState?.svg || "",
                )
            }

            // Update session state
            currentSession.xml = xml
            currentSession.version++

            // Push to embedded server state. The model just authored this
            // exact XML, so record it as seen — edit_diagram may follow
            // without a redundant get_diagram round-trip.
            setState(currentSession.id, xml)
            currentSession.lastSeenXml = xml

            // Save AI result (no SVG yet - will be captured by browser)
            addHistory(currentSession.id, xml, "")

            // Report page count back to the caller so the LLM learns whether
            // multi-page worked or fell back to single.
            const doc = parseMxfile(xml)
            const pages = doc ? listPagesFromDoc(doc) : []
            const pageSummary =
                pages.length > 1
                    ? `${pages.length} pages: ${pages.map((p) => `${p.index}:${p.name}`).join(", ")}`
                    : pages.length === 1
                      ? `1 page: ${pages[0].name}`
                      : "no pages parsed"

            log.info(`Diagram content set successfully (${pageSummary})`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram content set successfully!\n\nThe diagram is now visible in your browser.\n\nXML length: ${xml.length} characters\n${pageSummary}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("create_new_diagram failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: load_diagram
registerWriteTool(
    "load_diagram",
    {
        title: "Load .drawio file",
        description:
            "Load a .drawio file from disk into the current session, REPLACING the entire diagram (all pages). " +
            "The server reads the file directly — you do NOT need to read the file yourself or pass its XML through create_new_diagram. " +
            "Handles both plain-XML and draw.io's compressed save format.\n\n" +
            "After loading, call get_diagram before edit_diagram — you haven't seen the file's cell IDs or structure yet.",
        inputSchema: {
            path: z
                .string()
                .describe(
                    "Absolute path to the .drawio file to load (e.g. /Users/me/diagram.drawio or ~/diagram.drawio). Relative paths resolve against the MCP server's working directory, which is often not your project.",
                ),
        },
        annotations: { openWorldHint: false },
    },
    async ({ path }) => {
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Please call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            const fs = await import("node:fs/promises")
            const nodePath = await import("node:path")
            const absolutePath = nodePath.resolve(expandHome(path))

            let content: string
            try {
                // A pipe or device could be read forever, and the other
                // write tools wait for this one
                if (!(await fs.stat(absolutePath)).isFile()) {
                    throw new Error("not a regular file")
                }
                content = await fs.readFile(absolutePath, "utf-8")
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Cannot read file ${absolutePath}: ${msg}`,
                        },
                    ],
                    isError: true,
                }
            }

            const loaded = parseDrawioFileContent(content)
            if (!loaded.ok) {
                return {
                    content: [{ type: "text", text: `Error: ${loaded.error}` }],
                    isError: true,
                }
            }
            const xml = loaded.xml

            log.info(
                `Loading diagram from ${absolutePath} (${xml.length} chars)`,
            )

            // Save the user's current state before replacing (same flow as
            // create_new_diagram).
            const browserState = sessionState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }
            if (currentSession.xml) {
                keepInHistory(
                    currentSession.id,
                    currentSession.xml,
                    browserState?.svg || "",
                )
            }

            currentSession.xml = xml
            currentSession.version++
            setState(currentSession.id, xml)
            // Deliberately NOT marking the loaded XML as seen: the model only
            // supplied a path, so it doesn't know the file's cell IDs. The
            // edit gate will require one get_diagram before edits.
            currentSession.lastSeenXml = ""

            addHistory(currentSession.id, xml, "")

            const doc = parseMxfile(xml)
            const pages = doc ? listPagesFromDoc(doc) : []
            const pageSummary =
                pages.length > 0
                    ? `Pages (${pages.length}): ${pages.map((p) => `[${p.index}] id=${p.id} name="${p.name}" cells=${p.cellCount}`).join(" | ")}`
                    : "no pages parsed"

            log.info(`Diagram loaded from file (${pageSummary})`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram loaded from ${absolutePath}!\n\nThe diagram is now visible in your browser.\n\n${pageSummary}\n\nCall get_diagram before edit_diagram — you haven't seen this file's cell IDs yet.`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("load_diagram failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: edit_diagram
registerWriteTool(
    "edit_diagram",
    {
        title: "Edit diagram",
        description:
            "Edit a specific page in the current diagram by ID-based operations (update/add/delete cells).\n\n" +
            "All-or-nothing: if any operation fails, nothing is applied and every failure is listed.\n\n" +
            "Freshness: the server remembers the last diagram state you have seen, and rejects this call " +
            "only if the user edited the diagram in the browser since then. You do NOT need to call " +
            "get_diagram before every edit: a rejected call changes nothing and includes the current XML " +
            "of the page, so you can rebuild your operations and retry.\n\n" +
            "Call get_diagram first only when you don't know the current diagram content (cell IDs, " +
            "structure) — e.g. the diagram wasn't created in this conversation, or you're unsure your " +
            "memory of it is accurate.\n\n" +
            "Multi-page targeting:\n" +
            "- page_id / page_name / page_index are optional; when all omitted, the FIRST page is targeted\n" +
            "- Use list_pages to discover what pages exist\n\n" +
            "Operations:\n" +
            "- add: Add a new cell. Provide cell_id (new unique id within the page) and new_xml. One cell per operation.\n" +
            "- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.\n" +
            "- delete: Remove a cell by its id. Only cell_id is needed. Its children and connected edges are deleted too, so give only a container's id.\n\n" +
            "For add/update, new_xml must be a complete mxCell element including mxGeometry. No XML comments. " +
            'Every " inside new_xml must be escaped as \\" in the JSON.\n\n' +
            "Example - Add a rectangle on the default (first) page:\n" +
            '{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=0;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}\n\n' +
            "Example - Delete a cell on the default page:\n" +
            '{"operations": [{"operation": "delete", "cell_id": "rect-1"}]}',
        inputSchema: {
            ...pageSelectorSchema,
            operations: z
                .array(
                    z.object({
                        operation: z
                            .enum(["update", "add", "delete"])
                            .describe(
                                "Operation to perform: add, update, or delete",
                            ),
                        cell_id: z
                            .string()
                            .describe(
                                "The id of the mxCell. Must match the id attribute in new_xml.",
                            ),
                        new_xml: z
                            .string()
                            .optional()
                            .describe(
                                "Complete mxCell XML element (required for update/add)",
                            ),
                    }),
                )
                .describe("Array of operations to apply"),
        },
        annotations: { openWorldHint: false },
    },
    async ({ operations, page_id, page_name, page_index }) => {
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Please call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            // Fetch latest state from browser. Re-normalise to mxfile: the
            // embed/sync path can hand back a bare <mxGraphModel>, and adopting
            // it verbatim would silently strip a multi-page document down to
            // one page on the next write.
            const browserState = sessionState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml =
                    normalizeToMxfile(browserState.xml) ?? browserState.xml
                log.info("Fetched latest diagram state from browser")
            }

            if (!currentSession.xml) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No diagram to edit. Please create a diagram first with create_new_diagram.",
                        },
                    ],
                    isError: true,
                }
            }

            const pageSelector = pickPageSelector({
                page_id,
                page_name,
                page_index,
            })

            // Enforce workflow: the model must have seen the current diagram
            // state. Content comparison instead of a wall-clock timeout —
            // slow reasoning between get_diagram and edit_diagram is fine as
            // long as nothing changed in the browser meanwhile (#885).
            const gate = checkEditGate(
                currentSession.lastSeenXml,
                browserState?.xml ?? "",
            )
            if (!gate.ok) {
                log.warn(
                    gate.reason === "stale"
                        ? "edit_diagram rejected: the browser has changes the model has not seen"
                        : "edit_diagram rejected: the model has not seen the diagram yet",
                )
                // The error carries the current page, so the model has now
                // seen it and can retry without a get_diagram round-trip,
                // unless other pages changed too.
                const liveXml = browserState?.xml || currentSession.xml
                currentSession.lastSeenXml = markPageSeen(
                    currentSession.lastSeenXml,
                    liveXml,
                    pageSelector,
                )
                const reason =
                    gate.reason === "stale"
                        ? "The diagram changed in the browser since you last saw it (e.g. manual user edits). No changes were made."
                        : "You have not seen this diagram yet, so no changes were made."
                const next =
                    currentSession.lastSeenXml === liveXml
                        ? "Build your operations on this XML and retry."
                        : `${OTHER_PAGES_UNSEEN} Call get_diagram without a page selector, then retry.`
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${reason}\n\nCurrent XML of ${describeSelector(pageSelector)}:\n\n${targetPageXml(currentSession.xml, pageSelector)}\n\n${next}`,
                        },
                    ],
                    isError: true,
                }
            }

            log.info(
                `Editing diagram with ${operations.length} operation(s) on ${describeSelector(pageSelector)}`,
            )

            const outcome = editDiagram(
                currentSession.xml,
                operations as DiagramOperation[],
                pageSelector,
            )
            if (!outcome.ok) {
                log.warn(`Edit rejected: ${outcome.errors.join("; ")}`)
                const text = outcome.pageError
                    ? `Error: ${outcome.errors[0]}`
                    : `Error: No changes were made because ${outcome.errors.length} operation(s) failed:\n${outcome.errors.map((e) => `- ${e}`).join("\n")}\n\nCurrent XML of ${describeSelector(pageSelector)}:\n\n${targetPageXml(currentSession.xml, pageSelector)}\n\nFix the operations against this XML and retry.`
                return {
                    content: [{ type: "text", text }],
                    isError: true,
                }
            }
            if (outcome.fixes.length > 0) {
                log.info(`new_xml auto-fixed: ${outcome.fixes.join("; ")}`)
            }
            const result = outcome.xml

            // Save the pre-edit state for undo (with cached SVG from browser).
            // Done only once the edit applied: a rejected edit returns above
            // without leaving a phantom history entry.
            keepInHistory(
                currentSession.id,
                currentSession.xml,
                browserState?.svg || "",
            )

            // Update state
            currentSession.xml = result
            currentSession.version++

            // Push to embedded server; the pushed XML is now the latest
            // state the model has seen.
            setState(currentSession.id, result)
            currentSession.lastSeenXml = result

            // Save AI result (no SVG yet - will be captured by browser)
            addHistory(currentSession.id, result, "")

            log.info(`Diagram edited successfully`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram edited successfully!\n\nApplied ${outcome.applied} operation(s) on ${describeSelector(pageSelector)}.`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("edit_diagram failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: get_diagram
server.registerTool(
    "get_diagram",
    {
        title: "Get diagram",
        description:
            "Get the current diagram XML (fetches latest from browser, including user's manual edits). " +
            "Call this when you don't know the current diagram content (cell IDs, pages, structure) — " +
            "e.g. before editing a diagram you didn't create in this conversation, or after edit_diagram " +
            "was rejected because the user changed the diagram in the browser.\n\n" +
            "Returns the full <mxfile> by default. If a page selector is provided, returns just that page's <mxGraphModel> embedded in a one-page <mxfile> wrapper.",
        inputSchema: {
            ...pageSelectorSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
        // Defensive: when every field is optional an MCP client could in
        // principle invoke us with no `arguments` field. The SDK's zod parse
        // normally produces `{}` in that case, but we coalesce explicitly so
        // a destructure of `undefined` can never throw before we reach the
        // session-existence check.
        const { page_id, page_name, page_index } = input ?? {}
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Please call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            // start_session may replace currentSession while this waits
            const session = currentSession
            // Request browser to push fresh state and wait for it (an
            // expired session first gets its saved file back to sync)
            let staleNote = ""
            restoreSavedSession(session.id)
            const syncRequested = requestSync(session.id)
            if (syncRequested) {
                const synced = await waitForSync(session.id)
                if (!synced) {
                    log.warn("get_diagram: sync timeout - state may be stale")
                    staleNote =
                        "\n\nNote: the browser did not respond, so this XML may not include the user's latest manual edits (is the preview tab open?)."
                }
            }

            // Fetch latest state from browser, re-normalising to mxfile so a
            // bare <mxGraphModel> pushed back by the embed/sync path doesn't
            // strip page structure (see edit_diagram for the same guard).
            const browserState = sessionState(session.id)
            if (browserState?.xml) {
                session.xml =
                    normalizeToMxfile(browserState.xml) ?? browserState.xml
            }

            if (!session.xml) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No diagram exists yet. Use create_new_diagram to create one.",
                        },
                    ],
                }
            }

            const pageSelector = pickPageSelector({
                page_id,
                page_name,
                page_index,
            })

            // The model is now looking at the current state. Record the raw
            // store value — the gate's fast path is plain string equality
            // against the store, with a structural comparison as fallback.
            const liveXml = browserState?.xml || session.xml
            const doc = parseMxfile(session.xml)
            const pages = doc ? listPagesFromDoc(doc) : []
            const pageList = pages.length
                ? `Pages (${pages.length}): ${pages.map((p) => `[${p.index}] id=${p.id} name="${p.name}" cells=${p.cellCount}`).join(" | ")}`
                : "No <mxfile> wrapper detected (legacy single-page session)."

            // No selector → return full mxfile
            if (!hasPageSelector(pageSelector)) {
                session.lastSeenXml = liveXml
                return {
                    content: [
                        {
                            type: "text",
                            text: `Current diagram XML:\n\n${session.xml}\n\n${pageList}${staleNote}`,
                        },
                    ],
                }
            }

            // Selector → return a single-page projection
            const projection = projectPage(session.xml, pageSelector)
            if (!projection.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text:
                                projection.reason === "parse"
                                    ? `Error: a page selector was given but the current session XML could not be parsed as a multi-page <mxfile> (it may be a legacy single-page document or malformed), so it has no addressable pages.\n\n${pageList}`
                                    : `Error: Page ${describeSelector(pageSelector)} not found.\n\n${pageList}`,
                        },
                    ],
                    isError: true,
                }
            }
            // One page shown counts for all only if the others are as the
            // model saw them last
            session.lastSeenXml = markPageSeen(
                session.lastSeenXml,
                liveXml,
                pageSelector,
            )
            const otherPagesNote =
                session.lastSeenXml === liveXml
                    ? ""
                    : `\n\nNote: ${OTHER_PAGES_UNSEEN} Call get_diagram without a page selector before editing.`
            return {
                content: [
                    {
                        type: "text",
                        text: `Page ${projection.index} ("${projection.name}"):\n\n${projection.xml}\n\n${pageList}${staleNote}${otherPagesNote}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("get_diagram failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// The browser bridge has one export slot per session, so export requests
// run one at a time: a concurrent call waits for the previous one.
let exportQueue: Promise<unknown> = Promise.resolve()

/**
 * Ask the browser to export (optionally via a page projection) and poll for
 * the resulting image data. Resolves to undefined on timeout.
 */
function exportViaBrowser(
    sessionId: string,
    format: ExportFormat,
    projectionXml?: string,
    options?: ExportOptions,
): Promise<string | undefined> {
    const run = exportQueue.then(async () => {
        requestExport(sessionId, format, projectionXml, options)

        // A projection export does an extra load + render round-trip in the
        // browser, so give it a longer window. Re-read the live store entry
        // each tick: setState() (from a concurrent autosave or tool call)
        // replaces the Map entry with a new object, so a captured reference
        // would go stale and never observe the browser's exportData.
        const timeoutMs = projectionXml ? 15000 : 10000
        const start = Date.now()
        let exportData: string | undefined
        while (Date.now() - start < timeoutMs) {
            exportData = getState(sessionId)?.exportData
            if (exportData) break
            await new Promise((r) => setTimeout(r, 200))
        }
        const live = getState(sessionId)
        if (live) {
            live.exportData = undefined
            live.exportFormat = undefined
            live.exportXml = undefined
            live.exportOptions = undefined
            live.exportId = undefined
        }
        return exportData
    })
    exportQueue = run.catch(() => {})
    return run
}

/**
 * True when the preview tab polled before but has gone quiet. Browsers
 * slow down timers in background tabs (Chrome: about once a minute after
 * 5 minutes hidden), so an export would just time out.
 */
function previewStalled(sessionId: string): boolean {
    const lastPolled = getState(sessionId)?.lastPolled
    return lastPolled !== undefined && Date.now() - lastPolled > 10_000
}

function previewStalledError(sessionId: string) {
    return {
        content: [
            {
                type: "text" as const,
                text: `Error: The preview tab is not responding (browsers pause background tabs). Ask the user to bring the preview tab to the front (http://localhost:${getServerPort()}?mcp=${sessionId}), then retry.`,
            },
        ],
        isError: true,
    }
}

/** The <diagram id> of the page a selector targets, for draw.io's pageId. */
function pageIdFor(xml: string, selector: PageSelector): string | undefined {
    const doc = parseMxfile(xml)
    return (
        (doc && findPageElement(doc, selector)?.element.getAttribute("id")) ||
        undefined
    )
}

// Screenshot size: Claude Desktop caps a tool result at about 150,000
// characters, so retry smaller above 140,000 base64 characters. (Claude
// Code 2.1 accepted a 240,000 character image in testing.)
const SCREENSHOT_WIDTHS = [1000, 700]
const MAX_SCREENSHOT_CHARS = 140_000

// Adapted from the web app's vision check (lib/validation-prompts.ts)
const SCREENSHOT_CHECKLIST = `Check this rendering of the diagram for:
1. Overlapping shapes that cover each other or their labels (critical)
2. Edges crossing shapes that are not their source or target (critical)
3. Text that is cut off, overlapping or too small to read (warning)
4. Layout problems: cramped shapes, poor spacing or misalignment (warning)
5. Rendering errors: missing, incomplete or broken elements, such as an icon that did not load (critical)
If there are critical issues, fix them with edit_diagram and take one more screenshot. Do at most two rounds of fixes. Minor cosmetic issues are fine, and diagrams with only 1 or 2 shapes pass unless something is clearly broken.`

// Tool: screenshot_diagram
server.registerTool(
    "screenshot_diagram",
    {
        title: "Screenshot diagram",
        description:
            "Render the diagram in the preview and return it as a PNG image, so you can see your own result. " +
            "Call this once after drawing or heavily editing a complex diagram, then fix overlaps and edges that cross shapes. " +
            "Without a page selector it shows the page on screen. Needs the preview tab to be open.",
        inputSchema: { ...pageSelectorSchema },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
        const { page_id, page_name, page_index } = input ?? {}
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Please call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }
            if (previewStalled(currentSession.id)) {
                return previewStalledError(currentSession.id)
            }
            const xml =
                sessionState(currentSession.id)?.xml || currentSession.xml
            if (!hasCells(xml)) {
                return {
                    content: [{ type: "text", text: "The diagram is empty." }],
                }
            }

            const pageSelector = pickPageSelector({
                page_id,
                page_name,
                page_index,
            })
            let pageId: string | undefined
            let projectionXml: string | undefined
            if (hasPageSelector(pageSelector)) {
                const doc = normalizeToMxfile(xml) ?? xml
                pageId = pageIdFor(doc, pageSelector)
                // A page without an id: load just that page and capture
                // it, as export_diagram does
                if (!pageId) {
                    const projection = projectPage(doc, pageSelector)
                    if (!projection.ok) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Error: Page ${describeSelector(pageSelector)} not found.`,
                                },
                            ],
                            isError: true,
                        }
                    }
                    projectionXml = projection.xml
                }
            }

            let data: string | undefined
            // start_session may replace currentSession between the tries
            const sessionId = currentSession.id
            for (const width of SCREENSHOT_WIDTHS) {
                data = await exportViaBrowser(sessionId, "png", projectionXml, {
                    width,
                    pageId,
                })
                if (!data || data.length <= MAX_SCREENSHOT_CHARS) break
            }
            if (!data) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: Screenshot timed out. Make sure the preview tab is open and in front.",
                        },
                    ],
                    isError: true,
                }
            }
            return {
                content: [
                    {
                        type: "image",
                        data: data.replace(/^data:image\/png;base64,/, ""),
                        mimeType: "image/png",
                    },
                    {
                        type: "text",
                        text: `Screenshot of ${hasPageSelector(pageSelector) ? `page ${describeSelector(pageSelector)}` : "the page on screen"}.\n\n${SCREENSHOT_CHECKLIST}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("screenshot_diagram failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: export_diagram
server.registerTool(
    "export_diagram",
    {
        title: "Export diagram",
        description:
            "Export the current diagram to a file. Supports .drawio (XML), .png, .svg, and .drawio.svg (an SVG with the diagram embedded, which draw.io can open and edit again). " +
            "The format is auto-detected from the file extension, or can be specified explicitly.\n\n" +
            "Multi-page behaviour:\n" +
            "- .drawio with NO page selector: writes the full <mxfile> (all pages).\n" +
            "- .drawio with a page selector: writes a single-page <mxfile> containing only that page.\n" +
            "- .png / .svg with NO page selector: exports the currently active page in the browser.\n" +
            "- .png with a page selector: renders that page without changing what the user sees.\n" +
            "- .svg / .drawio.svg with a page selector: temporarily loads that page into the browser, captures it, then restores the full document (the user sees a brief flicker).",
        inputSchema: {
            ...pageSelectorSchema,
            path: z
                .string()
                .describe(
                    "Absolute file path to save to (e.g. /Users/me/diagram.drawio, ~/diagram.png). Relative paths resolve against the MCP server's working directory, which is often not your project.",
                ),
            format: z
                .enum(["drawio", "png", "svg", "drawio.svg"])
                .optional()
                .describe(
                    "Export format. If omitted, detected from file extension. Defaults to drawio.",
                ),
        },
        annotations: { openWorldHint: false },
    },
    async ({ path: rawPath, format, page_id, page_name, page_index }) => {
        const path = expandHome(rawPath)
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Please call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            // start_session may replace currentSession while this waits
            const session = currentSession

            // Detect format from extension if not specified
            const lowerPath = path.toLowerCase()
            const detectedFormat =
                format ||
                (lowerPath.endsWith(".drawio.svg")
                    ? "drawio.svg"
                    : lowerPath.endsWith(".png")
                      ? "png"
                      : lowerPath.endsWith(".svg")
                        ? "svg"
                        : "drawio")

            // The .drawio file is written from the state, so get the
            // user's latest edits into it first, as get_diagram does (the
            // images are made by the browser from its canvas)
            let syncNote = ""
            if (detectedFormat === "drawio") {
                restoreSavedSession(session.id)
                if (!requestSync(session.id)) {
                    syncNote =
                        "\n\nNote: the preview was not reachable, so the file may not include the user's latest manual edits."
                } else if (!(await waitForSync(session.id))) {
                    log.warn(
                        "export_diagram: sync timeout - state may be stale",
                    )
                    syncNote =
                        "\n\nNote: the browser did not respond, so the file may not include the user's latest manual edits (is the preview tab open?)."
                }
            }

            // Fetch latest state, re-normalised to mxfile so a page
            // selector works on a bare <mxGraphModel> pushed by the browser
            const browserState = sessionState(session.id)
            if (browserState?.xml) {
                session.xml =
                    normalizeToMxfile(browserState.xml) ?? browserState.xml
            }

            if (!session.xml) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No diagram to export. Please create a diagram first.",
                        },
                    ],
                    isError: true,
                }
            }

            const pageSelector = pickPageSelector({
                page_id,
                page_name,
                page_index,
            })

            const fs = await import("node:fs/promises")
            const nodePath = await import("node:path")

            // .drawio path - write XML directly (no browser round-trip).
            if (detectedFormat === "drawio") {
                let filePath = path
                if (!filePath.toLowerCase().endsWith(".drawio")) {
                    filePath = `${filePath}.drawio`
                }
                const absolutePath = nodePath.resolve(filePath)

                let outXml = session.xml
                if (hasPageSelector(pageSelector)) {
                    const projection = projectPage(session.xml, pageSelector)
                    if (!projection.ok) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text:
                                        projection.reason === "parse"
                                            ? "Error: Cannot parse current session XML as <mxfile>; cannot project a single page."
                                            : `Error: Page ${describeSelector(pageSelector)} not found for export.`,
                                },
                            ],
                            isError: true,
                        }
                    }
                    outXml = projection.xml
                }

                await fs.writeFile(absolutePath, outXml, "utf-8")
                log.info(`Diagram exported to ${absolutePath}`)
                return {
                    content: [
                        {
                            type: "text",
                            text: `Diagram exported successfully!\n\nFile: ${absolutePath}\nSize: ${outXml.length} characters${syncNote}`,
                        },
                    ],
                }
            }

            // PNG or SVG: request browser to export via iframe. Replace a
            // known extension that does not match the format.
            let filePath = path
            const suffix = `.${detectedFormat}`
            if (!lowerPath.endsWith(suffix)) {
                const known = [".drawio.svg", ".drawio", ".png", ".svg"].find(
                    (e) => lowerPath.endsWith(e),
                )
                if (known) filePath = filePath.slice(0, -known.length)
                filePath = `${filePath}${suffix}`
            }
            const absolutePath = nodePath.resolve(filePath)
            // draw.io's name for an SVG with the diagram embedded
            const browserFormat =
                detectedFormat === "drawio.svg" ? "xmlsvg" : detectedFormat

            const state = sessionState(session.id)
            if (!state) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: Session state not found. Is the browser open?",
                        },
                    ],
                    isError: true,
                }
            }
            if (previewStalled(session.id)) {
                return previewStalledError(session.id)
            }

            // -----------------------------------------------------------------
            // Page-targeted PNG/SVG export.
            //
            // drawio's JSON embed protocol has no working `selectPage` action,
            // so to export a specific page we build a single-page <mxfile>
            // projection and hand it to the browser bridge alongside the export
            // request. The bridge loads the projection, waits for draw.io's own
            // render, exports, then reloads the user's real document — entirely
            // browser-side. The canonical session state is never mutated here,
            // so there is no restore race and no concurrent-edit clobbering.
            // -----------------------------------------------------------------
            // PNG: draw.io renders any page by id, without touching the
            // page on screen. SVG export has no page option, so it still
            // needs the projection below.
            let projectionXml: string | undefined
            let pngPageId: string | undefined
            if (hasPageSelector(pageSelector) && detectedFormat === "png") {
                pngPageId = pageIdFor(session.xml, pageSelector)
            }
            if (hasPageSelector(pageSelector) && !pngPageId) {
                const projection = projectPage(session.xml, pageSelector)
                if (!projection.ok) {
                    return {
                        content: [
                            {
                                type: "text",
                                text:
                                    projection.reason === "parse"
                                        ? "Error: Cannot parse current session XML as <mxfile>; cannot target page for export."
                                        : `Error: Page ${describeSelector(pageSelector)} not found for export.`,
                            },
                        ],
                        isError: true,
                    }
                }
                projectionXml = projection.xml
            }

            const exportData = await exportViaBrowser(
                session.id,
                browserFormat,
                projectionXml,
                pngPageId ? { pageId: pngPageId } : undefined,
            )

            if (!exportData) {
                return {
                    content: [
                        {
                            type: "text",
                            text: projectionXml
                                ? "Error: Export timed out after loading the single-page projection. The browser may be closed or unresponsive."
                                : "Error: Export timed out. Make sure the browser tab is open and the diagram is loaded.",
                        },
                    ],
                    isError: true,
                }
            }

            // Decode and write
            if (detectedFormat === "png") {
                const base64 = exportData.replace(
                    /^data:image\/png;base64,/,
                    "",
                )
                await fs.writeFile(absolutePath, Buffer.from(base64, "base64"))
            } else {
                let svgContent = exportData
                if (svgContent.startsWith("data:image/svg+xml;base64,")) {
                    const base64 = svgContent.replace(
                        /^data:image\/svg\+xml;base64,/,
                        "",
                    )
                    svgContent = Buffer.from(base64, "base64").toString("utf-8")
                }
                await fs.writeFile(absolutePath, svgContent, "utf-8")
            }

            const stat = await fs.stat(absolutePath)
            log.info(
                `Diagram exported to ${absolutePath} (${detectedFormat}, ${stat.size} bytes)`,
            )
            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram exported successfully!\n\nFile: ${absolutePath}\nFormat: ${detectedFormat}\nSize: ${stat.size} bytes`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("export_diagram failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

/**
 * Shared helper for page-CRUD tools.
 * Loads the latest session XML, normalises to mxfile if needed, returns a
 * parsed Document the caller can mutate, plus a writer that persists.
 */
async function loadMxfileForMutation(): Promise<
    | { ok: true; doc: Document; writeBack: (newDoc: Document) => void }
    | { ok: false; message: string }
> {
    if (!currentSession) {
        return {
            ok: false,
            message: "No active session. Please call start_session first.",
        }
    }
    // Pull latest from browser so we don't clobber autosaved changes.
    const browserState = sessionState(currentSession.id)
    if (browserState?.xml) {
        currentSession.xml = browserState.xml
    }
    if (!currentSession.xml) {
        return {
            ok: false,
            message:
                "No diagram exists yet. Use create_new_diagram first, then page tools.",
        }
    }
    // Make sure the in-memory shape is canonical mxfile before any CRUD.
    const normalized = normalizeToMxfile(currentSession.xml)
    if (!normalized) {
        return {
            ok: false,
            message:
                "Current session XML is neither <mxGraphModel> nor <mxfile>; cannot perform page operations.",
        }
    }
    currentSession.xml = normalized

    const doc = parseMxfile(currentSession.xml)
    if (!doc) {
        return {
            ok: false,
            message: "Failed to parse current session XML as <mxfile>.",
        }
    }
    const sessionRef = currentSession
    return {
        ok: true,
        doc,
        writeBack: (newDoc: Document) => {
            const newXml = serializeMxfile(newDoc)
            // The store may hold user edits the model has not seen yet.
            const sawLatest = checkEditGate(
                sessionRef.lastSeenXml,
                browserState?.xml ?? "",
            ).ok
            // Save history before overwriting so the user can undo.
            keepInHistory(
                sessionRef.id,
                sessionRef.xml,
                browserState?.svg || "",
            )
            sessionRef.xml = newXml
            sessionRef.version++
            setState(sessionRef.id, newXml)
            // The model just wrote this exact state. If it had seen the state
            // it built on, mark the result as seen so edit_diagram needs no
            // extra get_diagram; otherwise edit_diagram must ask for one.
            sessionRef.lastSeenXml = sawLatest ? newXml : ""
            addHistory(sessionRef.id, newXml, "")
        },
    }
}

// Tool: list_pages
server.registerTool(
    "list_pages",
    {
        title: "List pages",
        description:
            "List every page (tab) in the current diagram. Returns each page's id, name, 0-based index, and cell count. Use this to discover what pages exist before targeting one with edit_diagram, get_diagram, export_diagram, rename_page, or delete_page.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
        try {
            const loaded = await loadMxfileForMutation()
            if (!loaded.ok) {
                return {
                    content: [
                        { type: "text", text: `Error: ${loaded.message}` },
                    ],
                    isError: true,
                }
            }
            const pages = listPagesFromDoc(loaded.doc)
            if (pages.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No pages in document.",
                        },
                    ],
                }
            }
            const lines = pages.map(
                (p) =>
                    `  [${p.index}] id="${p.id}" name="${p.name}" cells=${p.cellCount}`,
            )
            return {
                content: [
                    {
                        type: "text",
                        text: `Pages (${pages.length}):\n${lines.join("\n")}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("list_pages failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: add_page
registerWriteTool(
    "add_page",
    {
        title: "Add page",
        description:
            'Append a new page (tab) to the current diagram WITHOUT touching existing pages or unsaved user changes. Use this when the user wants "another diagram alongside" — e.g. "add a CNN page" — instead of create_new_diagram which wipes everything.\n\n' +
            "Inputs:\n" +
            "- name: optional display name for the tab (defaults to Page-N where N = existing-page-count + 1)\n" +
            "- id: optional explicit page id; if omitted the server generates a short alphanumeric id\n" +
            '- xml: optional starting content: the mxCell elements of the page (root cells "0" and "1" are added), or a bare <mxGraphModel>. If omitted, the page starts blank.\n\n' +
            "Returns the new page's id, name, and index so the caller can immediately target it with edit_diagram.",
        inputSchema: {
            name: z
                .string()
                .optional()
                .describe(
                    'Optional display name for the new tab (e.g. "CNN"). Defaults to "Page-N".',
                ),
            id: z
                .string()
                .min(1)
                .optional()
                .describe(
                    "Optional explicit page id. If omitted the server generates one. Must be unique across pages.",
                ),
            xml: z
                .string()
                .optional()
                .describe(
                    "Optional starting content: the mxCell elements of the page, or a bare <mxGraphModel>. If omitted the page starts blank.",
                ),
        },
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
        // All three fields optional — coalesce so a no-args call doesn't
        // crash on destructure before we surface a proper MCP error.
        const { name, id, xml } = input ?? {}
        try {
            const loaded = await loadMxfileForMutation()
            if (!loaded.ok) {
                return {
                    content: [
                        { type: "text", text: `Error: ${loaded.message}` },
                    ],
                    isError: true,
                }
            }

            // If caller provided XML, validate it before splicing it in so we
            // never get a half-broken mxfile written to the session.
            const reserved = xml && reservedIdError(xml)
            if (reserved) {
                return {
                    content: [{ type: "text", text: `Error: ${reserved}` }],
                    isError: true,
                }
            }
            let cleanXml: string | undefined = xml && wrapCellsInModel(xml)
            if (cleanXml) {
                const { valid, error, fixed, fixes } =
                    validateAndFixXml(cleanXml)
                if (fixed) {
                    cleanXml = fixed
                    log.info(
                        `add_page: starting XML auto-fixed: ${fixes.join(", ")}`,
                    )
                }
                if (!valid && error) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Error: starting xml validation failed - ${error}`,
                            },
                        ],
                        isError: true,
                    }
                }
            }

            let info
            try {
                info = addPageToDoc(loaded.doc, { id, name, xml: cleanXml })
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                return {
                    content: [{ type: "text", text: `Error: ${msg}` }],
                    isError: true,
                }
            }

            loaded.writeBack(loaded.doc)
            log.info(
                `Added page id=${info.id} name="${info.name}" index=${info.index}`,
            )
            return {
                content: [
                    {
                        type: "text",
                        text: `Page added.\n\nid=${info.id}\nname=${info.name}\nindex=${info.index}\ncells=${info.cellCount}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("add_page failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: rename_page
registerWriteTool(
    "rename_page",
    {
        title: "Rename page",
        description:
            "Rename an existing page (tab). At least one of page_id / page_name / page_index is required to identify which page to rename. The new_name becomes the visible tab label in the editor.",
        inputSchema: {
            ...pageSelectorSchema,
            new_name: z
                .string()
                .min(1)
                .describe("The new display name for the page tab."),
        },
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ new_name, page_id, page_name, page_index }) => {
        try {
            const loaded = await loadMxfileForMutation()
            if (!loaded.ok) {
                return {
                    content: [
                        { type: "text", text: `Error: ${loaded.message}` },
                    ],
                    isError: true,
                }
            }

            const pageSelector = pickPageSelector({
                page_id,
                page_name,
                page_index,
            })
            if (!hasPageSelector(pageSelector)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: rename_page requires one of page_id, page_name, or page_index to identify the page.",
                        },
                    ],
                    isError: true,
                }
            }

            const ok = renamePageInDoc(loaded.doc, pageSelector, new_name)
            if (!ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Page ${describeSelector(pageSelector)} not found.`,
                        },
                    ],
                    isError: true,
                }
            }

            loaded.writeBack(loaded.doc)
            log.info(
                `Renamed page ${describeSelector(pageSelector)} → "${new_name}"`,
            )
            return {
                content: [
                    {
                        type: "text",
                        text: `Page ${describeSelector(pageSelector)} renamed to "${new_name}".`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("rename_page failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: delete_page
registerWriteTool(
    "delete_page",
    {
        title: "Delete page",
        description:
            "Delete a page (tab) from the current diagram. At least one of page_id / page_name / page_index is required. Refuses to delete the last remaining page — the editor needs at least one tab.",
        inputSchema: {
            ...pageSelectorSchema,
        },
        annotations: { openWorldHint: false },
    },
    async (input) => {
        // All three fields are optional — coalesce so a no-args call returns
        // a clean error message instead of crashing on destructure.
        const { page_id, page_name, page_index } = input ?? {}
        try {
            const loaded = await loadMxfileForMutation()
            if (!loaded.ok) {
                return {
                    content: [
                        { type: "text", text: `Error: ${loaded.message}` },
                    ],
                    isError: true,
                }
            }

            const pageSelector = pickPageSelector({
                page_id,
                page_name,
                page_index,
            })
            if (!hasPageSelector(pageSelector)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: delete_page requires one of page_id, page_name, or page_index to identify the page.",
                        },
                    ],
                    isError: true,
                }
            }

            const outcome = deletePageFromDoc(loaded.doc, pageSelector)
            if (!outcome.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${outcome.reason}.`,
                        },
                    ],
                    isError: true,
                }
            }

            loaded.writeBack(loaded.doc)
            log.info(
                `Deleted page id=${outcome.deletedId} index=${outcome.deletedIndex}`,
            )
            return {
                content: [
                    {
                        type: "text",
                        text: `Page deleted (id=${outcome.deletedId}, was at index ${outcome.deletedIndex}).`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("delete_page failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Graceful shutdown handler
let isShuttingDown = false
function gracefulShutdown(reason: string) {
    if (isShuttingDown) return
    isShuttingDown = true
    log.info(`Shutting down: ${reason}`)
    autosaver.flush()
    shutdown()
    process.exit(0)
}

// Handle stdin close (primary method - works on all platforms including Windows)
process.stdin.on("close", () => gracefulShutdown("stdin closed"))
process.stdin.on("end", () => gracefulShutdown("stdin ended"))

// Handle signals (may not work reliably on Windows)
process.on("SIGINT", () => gracefulShutdown("SIGINT"))
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))

// Handle broken pipe (writing to closed stdout)
process.stdout.on("error", (err) => {
    if (err.code === "EPIPE" || err.code === "ERR_STREAM_DESTROYED") {
        gracefulShutdown("stdout error")
    }
})

// Start the MCP server
async function main() {
    log.info("Starting MCP server for Next AI Draw.io (embedded mode)...")

    const transport = new StdioServerTransport()
    await server.connect(transport)

    log.info("MCP server running on stdio")
}

main().catch((error) => {
    log.error("Fatal error:", error)
    process.exit(1)
})
