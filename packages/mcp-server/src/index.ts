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

// Setup DOM polyfill for Node.js (required for XML operations)
import { DOMParser } from "linkedom"
;(globalThis as any).DOMParser = DOMParser

// Create XMLSerializer polyfill using outerHTML
class XMLSerializerPolyfill {
    serializeToString(node: any): string {
        if (node.outerHTML !== undefined) {
            return node.outerHTML
        }
        if (node.documentElement) {
            return node.documentElement.outerHTML
        }
        return ""
    }
}
;(globalThis as any).XMLSerializer = XMLSerializerPolyfill

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import open from "open"
import { z } from "zod"
import {
    applyDiagramOperations,
    type DiagramOperation,
} from "./diagram-operations.js"
import { addHistory } from "./history.js"
import {
    getState,
    requestExport,
    requestSync,
    setState,
    shutdown,
    startHttpServer,
    waitForSync,
} from "./http-server.js"
import { log } from "./logger.js"
import {
    addPageToDoc,
    deletePageFromDoc,
    hasPageSelector,
    listPagesFromDoc,
    normalizeToMxfile,
    type PageSelector,
    parseMxfile,
    projectPage,
    renamePageInDoc,
    serializeMxfile,
} from "./pages.js"
import { validateAndFixXml } from "./xml-validation.js"

// Server configuration
const config = {
    port: parseInt(process.env.PORT || "6002", 10),
}

// Session state (single session for simplicity)
let currentSession: {
    id: string
    xml: string
    version: number
    lastGetDiagramTime: number // Track when get_diagram was last called (for enforcing workflow)
} | null = null

// Create MCP server
const server = new McpServer({
    name: "next-ai-drawio",
    version: "0.3.0",
})

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

// Register prompt with workflow guidance
server.prompt(
    "diagram-workflow",
    "Guidelines for creating and editing draw.io diagrams",
    () => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `# Draw.io Diagram Workflow Guidelines

## Creating a New Diagram
1. Call start_session to open the browser preview
2. Use create_new_diagram with either a bare <mxGraphModel> (single page) or a full <mxfile> with one or more <diagram> children (multi-page)

## Working with Multiple Pages
- Use list_pages to discover existing pages (id, name, index)
- Use add_page to append a new page (without losing existing ones — unlike create_new_diagram which REPLACES everything)
- Use rename_page / delete_page for management
- edit_diagram, get_diagram, and export_diagram all accept optional page_id / page_name / page_index — when omitted they target the first page

## Adding Elements to an Existing Page
1. Use edit_diagram with "add" operation, optionally with a page selector
2. Provide a unique cell_id and complete mxCell XML
3. No need to call get_diagram first - the server fetches latest state automatically

## Modifying or Deleting Existing Elements
1. FIRST call get_diagram to see current cell IDs and page structure
2. THEN call edit_diagram with "update" or "delete" operations
3. For update, provide the cell_id and complete new mxCell XML

## Important Notes
- create_new_diagram REPLACES the entire document, including ALL pages - only use for new diagrams. Use add_page to add a tab without losing existing content.
- edit_diagram PRESERVES the user's manual changes (fetches browser state first)
- Always use unique cell_ids within a page (cell ids "0" and "1" are reserved root sentinels and can repeat across pages)`,
                },
            },
        ],
    }),
)

// Tool: start_session
server.registerTool(
    "start_session",
    {
        description:
            "Start a new diagram session and open the browser for real-time preview. " +
            "Starts an embedded server and opens a browser window with draw.io. " +
            "The browser will show diagram updates as they happen.",
        inputSchema: {},
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
                lastGetDiagramTime: 0,
            }

            // Open browser
            const browserUrl = `http://localhost:${port}?mcp=${sessionId}`
            await open(browserUrl)

            log.info(`Started session ${sessionId}, browser at ${browserUrl}`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Session started successfully!\n\nSession ID: ${sessionId}\nBrowser URL: ${browserUrl}\n\nThe browser will now show real-time diagram updates.`,
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
server.registerTool(
    "create_new_diagram",
    {
        description: `Create a NEW diagram from XML. ONLY use this when creating a diagram from scratch.

⚠️ DESTRUCTIVE: This tool REPLACES the entire document, INCLUDING every existing page/tab and any unsaved user changes. To add a tab without losing existing content, use add_page instead. To modify cells on an existing page, use edit_diagram.

CRITICAL: You MUST provide the 'xml' argument in EVERY call. Do NOT call this tool without xml.

When to use this tool:
- Creating a new diagram from scratch (no existing diagram, or wanting to wipe and start over)
- The user explicitly asks to "start over" or "create a new diagram"

When to use add_page instead:
- The user wants ANOTHER tab/page alongside what's already there (e.g. "add a CNN diagram on a new page")

When to use edit_diagram instead:
- ANY modifications to an existing page's cells (add/remove/move shapes, change labels, etc.)

ACCEPTED XML SHAPES:

1) Bare mxGraphModel (single-page, legacy):
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Shape" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
The server auto-wraps this in <mxfile><diagram id="..." name="Page-1">...</diagram></mxfile>.

2) Full mxfile (one or more pages):
<mxfile host="app.diagrams.net">
  <diagram id="page-1" name="Architecture">
    <mxGraphModel><root>...</root></mxGraphModel>
  </diagram>
  <diagram id="page-2" name="Sequence">
    <mxGraphModel><root>...</root></mxGraphModel>
  </diagram>
</mxfile>
Each <diagram> becomes a tab in the embedded editor. Cell ids "0" and "1" are reserved root sentinels and MUST repeat in every page's <root>.

LAYOUT CONSTRAINTS (per page):
- Keep all elements within x=0-800, y=0-600 (single page viewport)
- Start from margins (x=40, y=40), keep elements grouped closely
- Use unique IDs starting from "2" within each page (0 and 1 are reserved)
- Set parent="1" for top-level shapes
- Space shapes 150-200px apart for clear edge routing

EDGE ROUTING RULES:
- Never let multiple edges share the same path - use different exitY/entryY values
- For bidirectional connections (A↔B), use OPPOSITE sides
- Always specify exitX, exitY, entryX, entryY explicitly in edge style
- Route edges AROUND obstacles using waypoints (add 20-30px clearance)
- Use natural connection points based on flow (not corners)

COMMON STYLES:
- Shapes: rounded=1; fillColor=#hex; strokeColor=#hex
- Edges: endArrow=classic; edgeStyle=orthogonalEdgeStyle; curved=1
- Text: fontSize=14; fontStyle=1 (bold); align=center`,
        inputSchema: {
            xml: z
                .string()
                .describe(
                    "REQUIRED: Either a complete <mxGraphModel> (legacy single-page) or a full <mxfile> with one or more <diagram> children (multi-page).",
                ),
        },
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

            // Validate and auto-fix XML (works for both mxfile and mxGraphModel inputs).
            let xml = inputXml
            const { valid, error, fixed, fixes } = validateAndFixXml(xml)
            if (fixed) {
                xml = fixed
                log.info(`XML auto-fixed: ${fixes.join(", ")}`)
            }
            if (!valid && error) {
                log.error(`XML validation failed: ${error}`)
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: XML validation failed - ${error}`,
                        },
                    ],
                    isError: true,
                }
            }

            // Normalise to the canonical mxfile shape so every later tool can
            // assume "session.xml is always an mxfile". Bare <mxGraphModel>
            // inputs are wrapped into a single-page mxfile here.
            const normalized = normalizeToMxfile(xml)
            if (!normalized) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: XML must be either a <mxGraphModel> or an <mxfile> with one or more <diagram> children.",
                        },
                    ],
                    isError: true,
                }
            }
            xml = normalized

            log.info(`Setting diagram content, ${xml.length} chars`)

            // Sync from browser state first
            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }

            // Save user's state before AI overwrites (with cached SVG)
            if (currentSession.xml) {
                addHistory(
                    currentSession.id,
                    currentSession.xml,
                    browserState?.svg || "",
                )
            }

            // Update session state
            currentSession.xml = xml
            currentSession.version++
            currentSession.lastGetDiagramTime = Date.now()

            // Push to embedded server state
            setState(currentSession.id, xml)

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

// Tool: edit_diagram
server.registerTool(
    "edit_diagram",
    {
        description:
            "Edit a specific page in the current diagram by ID-based operations (update/add/delete cells).\n\n" +
            "⚠️ REQUIRED: You MUST call get_diagram BEFORE this tool!\n" +
            "This fetches the latest state from the browser including any manual user edits.\n" +
            "Skipping get_diagram WILL cause user's changes to be LOST.\n\n" +
            "Workflow:\n" +
            "1. Call get_diagram to see current cell IDs, page structure, and active page\n" +
            "2. Use the returned XML to construct your edit operations\n" +
            "3. Call edit_diagram with your operations and (optionally) a page selector\n\n" +
            "Multi-page targeting:\n" +
            "- page_id / page_name / page_index are optional; when all omitted, the FIRST page is targeted\n" +
            "- Use list_pages to discover what pages exist\n\n" +
            "Operations:\n" +
            "- add: Add a new cell. Provide cell_id (new unique id within the page) and new_xml.\n" +
            "- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.\n" +
            "- delete: Remove a cell by its id. Only cell_id is needed.\n\n" +
            "For add/update, new_xml must be a complete mxCell element including mxGeometry.\n\n" +
            "Example - Add a rectangle on the default (first) page:\n" +
            '{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=0;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}\n\n' +
            "Example - Add a cell on a specific page by name:\n" +
            '{"page_name": "CNN", "operations": [{"operation": "add", "cell_id": "conv-1", "new_xml": "<mxCell id=\\"conv-1\\" ... />"}]}\n\n' +
            "Example - Update a cell on page index 1:\n" +
            '{"page_index": 1, "operations": [{"operation": "update", "cell_id": "3", "new_xml": "<mxCell id=\\"3\\" .../>"}]}\n\n' +
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
                        cell_id: z.string().describe("The id of the mxCell"),
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

            // Enforce workflow: require get_diagram to be called first
            const timeSinceGet = Date.now() - currentSession.lastGetDiagramTime
            if (timeSinceGet > 30000) {
                // 30 seconds
                log.warn(
                    "edit_diagram called without recent get_diagram - rejecting to prevent data loss",
                )
                return {
                    content: [
                        {
                            type: "text",
                            text:
                                "Error: You must call get_diagram first before edit_diagram.\n\n" +
                                "This ensures you have the latest diagram state including any manual edits the user made in the browser. " +
                                "Please call get_diagram, then use that XML to construct your edit operations.",
                        },
                    ],
                    isError: true,
                }
            }

            // Fetch latest state from browser. Re-normalise to mxfile: the
            // embed/sync path can hand back a bare <mxGraphModel>, and adopting
            // it verbatim would silently strip a multi-page document down to
            // one page on the next write.
            const browserState = getState(currentSession.id)
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
            log.info(
                `Editing diagram with ${operations.length} operation(s) on ${describeSelector(pageSelector)}`,
            )

            // Validate and auto-fix new_xml for each operation
            const validatedOps = operations.map((op) => {
                if (op.new_xml) {
                    const { valid, error, fixed, fixes } = validateAndFixXml(
                        op.new_xml,
                    )
                    if (fixed) {
                        log.info(
                            `Operation ${op.operation} ${op.cell_id}: XML auto-fixed: ${fixes.join(", ")}`,
                        )
                        return { ...op, new_xml: fixed }
                    }
                    if (!valid && error) {
                        log.warn(
                            `Operation ${op.operation} ${op.cell_id}: XML validation failed: ${error}`,
                        )
                    }
                }
                return op
            })

            // Apply operations on the targeted page
            const { result, errors } = applyDiagramOperations(
                currentSession.xml,
                validatedOps as DiagramOperation[],
                pageSelector,
            )

            if (errors.length > 0) {
                const errorMessages = errors
                    .map((e) => `${e.type} ${e.cellId}: ${e.message}`)
                    .join("\n")
                log.warn(`Edit had ${errors.length} error(s): ${errorMessages}`)
            }

            // A page-level error (empty cellId — e.g. the selector matched no
            // page, or the page had no <root>) means NOTHING was applied and
            // `result` is the unchanged input. Surface it as a hard error
            // instead of persisting a no-op and reporting success, so the
            // caller doesn't build on a wrong assumption.
            const pageError = errors.find((e) => e.cellId === "")
            if (pageError) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${pageError.message}`,
                        },
                    ],
                    isError: true,
                }
            }

            // Save the pre-edit state for undo (with cached SVG from browser).
            // Done only now that we know the edit applied — a page-level error
            // returns above without leaving a phantom history entry.
            addHistory(
                currentSession.id,
                currentSession.xml,
                browserState?.svg || "",
            )

            // Update state
            currentSession.xml = result
            currentSession.version++

            // Push to embedded server
            setState(currentSession.id, result)

            // Save AI result (no SVG yet - will be captured by browser)
            addHistory(currentSession.id, result, "")

            log.info(`Diagram edited successfully`)

            const successMsg = `Diagram edited successfully!\n\nApplied ${operations.length} operation(s) on ${describeSelector(pageSelector)}.`
            const errorMsg =
                errors.length > 0
                    ? `\n\nWarnings:\n${errors.map((e) => `- ${e.type} ${e.cellId}: ${e.message}`).join("\n")}`
                    : ""

            return {
                content: [
                    {
                        type: "text",
                        text: successMsg + errorMsg,
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
        description:
            "Get the current diagram XML (fetches latest from browser, including user's manual edits). " +
            "Call this BEFORE edit_diagram if you need to update or delete existing elements, " +
            "so you can see the current cell IDs, pages, and structure.\n\n" +
            "Returns the full <mxfile> by default. If a page selector is provided, returns just that page's <mxGraphModel> embedded in a one-page <mxfile> wrapper.",
        inputSchema: {
            ...pageSelectorSchema,
        },
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

            // Request browser to push fresh state and wait for it
            const syncRequested = requestSync(currentSession.id)
            if (syncRequested) {
                const synced = await waitForSync(currentSession.id)
                if (!synced) {
                    log.warn("get_diagram: sync timeout - state may be stale")
                }
            }

            // Mark that get_diagram was called (for edit_diagram workflow check)
            currentSession.lastGetDiagramTime = Date.now()

            // Fetch latest state from browser, re-normalising to mxfile so a
            // bare <mxGraphModel> pushed back by the embed/sync path doesn't
            // strip page structure (see edit_diagram for the same guard).
            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml =
                    normalizeToMxfile(browserState.xml) ?? browserState.xml
            }

            if (!currentSession.xml) {
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
            const doc = parseMxfile(currentSession.xml)
            const pages = doc ? listPagesFromDoc(doc) : []
            const pageList = pages.length
                ? `Pages (${pages.length}): ${pages.map((p) => `[${p.index}] id=${p.id} name="${p.name}" cells=${p.cellCount}`).join(" | ")}`
                : "No <mxfile> wrapper detected (legacy single-page session)."

            // No selector → return full mxfile
            if (!hasPageSelector(pageSelector)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Current diagram XML:\n\n${currentSession.xml}\n\n${pageList}`,
                        },
                    ],
                }
            }

            // Selector → return a single-page projection
            const projection = projectPage(currentSession.xml, pageSelector)
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
            return {
                content: [
                    {
                        type: "text",
                        text: `Page ${projection.index} ("${projection.name}"):\n\n${projection.xml}\n\n${pageList}`,
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

// Tool: export_diagram
server.registerTool(
    "export_diagram",
    {
        description:
            "Export the current diagram to a file. Supports .drawio (XML), .png, and .svg formats. " +
            "The format is auto-detected from the file extension, or can be specified explicitly.\n\n" +
            "Multi-page behaviour:\n" +
            "- .drawio with NO page selector: writes the full <mxfile> (all pages).\n" +
            "- .drawio with a page selector: writes a single-page <mxfile> containing only that page.\n" +
            "- .png / .svg with NO page selector: exports the currently active page in the browser.\n" +
            "- .png / .svg with a page selector: temporarily loads a single-page projection of that page into the browser, captures the rendered image, then restores the full document. The user will see a brief tab-flicker (~1-2s) but the exported image is guaranteed to be the requested page.",
        inputSchema: {
            ...pageSelectorSchema,
            path: z
                .string()
                .describe(
                    "File path to save the diagram (e.g., ./diagram.drawio, ./diagram.png, ./diagram.svg)",
                ),
            format: z
                .enum(["drawio", "png", "svg"])
                .optional()
                .describe(
                    "Export format. If omitted, detected from file extension. Defaults to drawio.",
                ),
        },
    },
    async ({ path, format, page_id, page_name, page_index }) => {
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

            // Fetch latest state
            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }

            if (!currentSession.xml) {
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

            // Detect format from extension if not specified
            const ext = nodePath.extname(path).toLowerCase()
            const detectedFormat =
                format ||
                (ext === ".png" ? "png" : ext === ".svg" ? "svg" : "drawio")

            // .drawio path - write XML directly (no browser round-trip).
            if (detectedFormat === "drawio") {
                let filePath = path
                if (!filePath.endsWith(".drawio")) {
                    filePath = `${filePath}.drawio`
                }
                const absolutePath = nodePath.resolve(filePath)

                let outXml = currentSession.xml
                if (hasPageSelector(pageSelector)) {
                    const projection = projectPage(
                        currentSession.xml,
                        pageSelector,
                    )
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
                            text: `Diagram exported successfully!\n\nFile: ${absolutePath}\nSize: ${outXml.length} characters`,
                        },
                    ],
                }
            }

            // PNG or SVG: request browser to export via iframe
            let filePath = path
            if (ext !== `.${detectedFormat}`) {
                if (ext === ".drawio" || ext === ".png" || ext === ".svg") {
                    filePath = filePath.slice(0, -ext.length)
                }
                filePath = `${filePath}.${detectedFormat}`
            }
            const absolutePath = nodePath.resolve(filePath)

            const state = getState(currentSession.id)
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
            let projectionXml: string | undefined
            if (hasPageSelector(pageSelector)) {
                const projection = projectPage(currentSession.xml, pageSelector)
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

            // Ask the browser to export (optionally via a page projection) and
            // poll for the resulting image data.
            requestExport(
                currentSession.id,
                detectedFormat as "png" | "svg",
                projectionXml,
            )

            // A projection export does an extra load + render round-trip in the
            // browser, so give it a longer window. Re-read the live store entry
            // each tick: setState() (from a concurrent autosave or tool call)
            // replaces the Map entry with a new object, so a captured reference
            // would go stale and never observe the browser's exportData.
            const timeoutMs = projectionXml ? 15000 : 10000
            const start = Date.now()
            let exportData: string | undefined
            while (Date.now() - start < timeoutMs) {
                exportData = getState(currentSession.id)?.exportData
                if (exportData) break
                await new Promise((r) => setTimeout(r, 200))
            }
            const live = getState(currentSession.id)
            if (live) {
                live.exportData = undefined
                live.exportFormat = undefined
                live.exportXml = undefined
            }

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
    const browserState = getState(currentSession.id)
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
            // Save history before overwriting so the user can undo.
            addHistory(sessionRef.id, sessionRef.xml, browserState?.svg || "")
            sessionRef.xml = newXml
            sessionRef.version++
            // Page CRUD updates the structure that get_diagram would return,
            // so refresh the workflow timestamp — subsequent edit_diagram
            // calls don't need a redundant get_diagram round-trip.
            sessionRef.lastGetDiagramTime = Date.now()
            setState(sessionRef.id, newXml)
            addHistory(sessionRef.id, newXml, "")
        },
    }
}

// Tool: list_pages
server.registerTool(
    "list_pages",
    {
        description:
            "List every page (tab) in the current diagram. Returns each page's id, name, 0-based index, and cell count. Use this to discover what pages exist before targeting one with edit_diagram, get_diagram, export_diagram, rename_page, or delete_page.",
        inputSchema: {},
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
server.registerTool(
    "add_page",
    {
        description:
            'Append a new page (tab) to the current diagram WITHOUT touching existing pages or unsaved user changes. Use this when the user wants "another diagram alongside" — e.g. "add a CNN page" — instead of create_new_diagram which wipes everything.\n\n' +
            "Inputs:\n" +
            "- name: optional display name for the tab (defaults to Page-N where N = existing-page-count + 1)\n" +
            "- id: optional explicit page id; if omitted the server generates a short alphanumeric id\n" +
            '- xml: optional starting <mxGraphModel> for the new page. If omitted, the page starts blank with the standard root sentinel cells ("0" and "1").\n\n' +
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
                    'Optional starting <mxGraphModel> XML for the new page. Must include <root> with id="0" and id="1" cells. If omitted the page starts blank.',
                ),
        },
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
            let cleanXml: string | undefined = xml
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
server.registerTool(
    "rename_page",
    {
        description:
            "Rename an existing page (tab). At least one of page_id / page_name / page_index is required to identify which page to rename. The new_name becomes the visible tab label in the editor.",
        inputSchema: {
            ...pageSelectorSchema,
            new_name: z
                .string()
                .min(1)
                .describe("The new display name for the page tab."),
        },
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
server.registerTool(
    "delete_page",
    {
        description:
            "Delete a page (tab) from the current diagram. At least one of page_id / page_name / page_index is required. Refuses to delete the last remaining page — the editor needs at least one tab.",
        inputSchema: {
            ...pageSelectorSchema,
        },
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
