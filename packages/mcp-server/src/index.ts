#!/usr/bin/env node
/**
 * MCP Server for Next AI Draw.io
 *
 * Enables AI agents (Claude Desktop, Cursor, etc.) to generate and edit
 * draw.io diagrams with real-time browser preview.
 *
 * Uses an embedded HTTP server - no external dependencies required.
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
    clearExportData,
    getExportData,
    getState,
    requestSync,
    setExportFormat,
    setState,
    shutdown,
    startHttpServer,
    waitForSync,
} from "./http-server.js"
import { log } from "./logger.js"
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
    version: "0.1.2",
})

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
2. Use create_new_diagram with complete mxGraphModel XML to create a new diagram

## Adding Elements to Existing Diagram
1. Use edit_diagram with "add" operation
2. Provide a unique cell_id and complete mxCell XML
3. No need to call get_diagram first - the server fetches latest state automatically

## Modifying or Deleting Existing Elements
1. FIRST call get_diagram to see current cell IDs and structure
2. THEN call edit_diagram with "update" or "delete" operations
3. For update, provide the cell_id and complete new mxCell XML

## Important Notes
- create_new_diagram REPLACES the entire diagram - only use for new diagrams
- edit_diagram PRESERVES user's manual changes (fetches browser state first)
- Always use unique cell_ids when adding elements (e.g., "shape-1", "arrow-2")`,
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
        description: `Create a NEW diagram from mxGraphModel XML. Use this when creating a diagram from scratch or replacing the current diagram entirely.

CRITICAL: You MUST provide the 'xml' argument in EVERY call. Do NOT call this tool without xml.

When to use this tool:
- Creating a new diagram from scratch
- Replacing the current diagram with a completely different one
- Major structural changes that require regenerating the diagram

When to use edit_diagram instead:
- Small modifications to existing diagram
- Adding/removing individual elements
- Changing labels, colors, or positions

XML FORMAT - Full mxGraphModel structure:
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Shape" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>

LAYOUT CONSTRAINTS:
- Keep all elements within x=0-800, y=0-600 (single page viewport)
- Start from margins (x=40, y=40), keep elements grouped closely
- Use unique IDs starting from "2" (0 and 1 are reserved)
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
                    "REQUIRED: The complete mxGraphModel XML. Must always be provided.",
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

            // Validate and auto-fix XML
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

            log.info(`Diagram content set successfully`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram content set successfully!\n\nThe diagram is now visible in your browser.\n\nXML length: ${xml.length} characters`,
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
            "Edit the current diagram by ID-based operations (update/add/delete cells).\n\n" +
            "⚠️ REQUIRED: You MUST call get_diagram BEFORE this tool!\n" +
            "This fetches the latest state from the browser including any manual user edits.\n" +
            "Skipping get_diagram WILL cause user's changes to be LOST.\n\n" +
            "Workflow:\n" +
            "1. Call get_diagram to see current cell IDs and structure\n" +
            "2. Use the returned XML to construct your edit operations\n" +
            "3. Call edit_diagram with your operations\n\n" +
            "Operations:\n" +
            "- add: Add a new cell. Provide cell_id (new unique id) and new_xml.\n" +
            "- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.\n" +
            "- delete: Remove a cell by its id. Only cell_id is needed.\n\n" +
            "For add/update, new_xml must be a complete mxCell element including mxGeometry.\n\n" +
            "Example - Add a rectangle:\n" +
            '{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=0;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}\n\n' +
            "Example - Update a cell:\n" +
            '{"operations": [{"operation": "update", "cell_id": "3", "new_xml": "<mxCell id=\\"3\\" value=\\"New Label\\" style=\\"rounded=1;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}\n\n' +
            "Example - Delete a cell:\n" +
            '{"operations": [{"operation": "delete", "cell_id": "rect-1"}]}',
        inputSchema: {
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
    async ({ operations }) => {
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

            // Fetch latest state from browser
            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
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

            log.info(`Editing diagram with ${operations.length} operation(s)`)

            // Save before editing (with cached SVG from browser)
            addHistory(
                currentSession.id,
                currentSession.xml,
                browserState?.svg || "",
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

            // Apply operations
            const { result, errors } = applyDiagramOperations(
                currentSession.xml,
                validatedOps as DiagramOperation[],
            )

            if (errors.length > 0) {
                const errorMessages = errors
                    .map((e) => `${e.type} ${e.cellId}: ${e.message}`)
                    .join("\n")
                log.warn(`Edit had ${errors.length} error(s): ${errorMessages}`)
            }

            // Update state
            currentSession.xml = result
            currentSession.version++

            // Push to embedded server
            setState(currentSession.id, result)

            // Save AI result (no SVG yet - will be captured by browser)
            addHistory(currentSession.id, result, "")

            log.info(`Diagram edited successfully`)

            const successMsg = `Diagram edited successfully!\n\nApplied ${operations.length} operation(s).`
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
            "so you can see the current cell IDs and structure.",
    },
    async () => {
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

            // Fetch latest state from browser
            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
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

            return {
                content: [
                    {
                        type: "text",
                        text: `Current diagram XML:\n\n${currentSession.xml}`,
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
            "The format is auto-detected from the file extension, or can be specified explicitly.",
        inputSchema: {
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
    async ({ path, format }) => {
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

            const fs = await import("node:fs/promises")
            const nodePath = await import("node:path")

            // Detect format from extension if not specified
            const ext = nodePath.extname(path).toLowerCase()
            const detectedFormat =
                format ||
                (ext === ".png" ? "png" : ext === ".svg" ? "svg" : "drawio")

            // Ensure file has the right extension
            let filePath = path
            const extMap: Record<string, string> = {
                drawio: ".drawio",
                png: ".png",
                svg: ".svg",
            }
            if (ext !== extMap[detectedFormat]) {
                // Strip existing supported extension to avoid double extensions
                if (ext === ".drawio" || ext === ".png" || ext === ".svg") {
                    filePath = filePath.slice(0, -ext.length)
                }
                filePath = `${filePath}${extMap[detectedFormat]}`
            }

            const absolutePath = nodePath.resolve(filePath)

            // Sync fresh state from browser before any export
            requestSync(currentSession.id)
            await waitForSync(currentSession.id)
            const freshState = getState(currentSession.id)
            if (freshState?.xml) {
                currentSession.xml = freshState.xml
            }

            if (detectedFormat === "drawio") {
                await fs.writeFile(absolutePath, currentSession.xml, "utf-8")
                log.info(`Diagram exported to ${absolutePath}`)
                return {
                    content: [
                        {
                            type: "text",
                            text: `Diagram exported successfully!\n\nFile: ${absolutePath}\nFormat: drawio\nSize: ${currentSession.xml.length} characters`,
                        },
                    ],
                }
            }

            // PNG or SVG: request browser to export
            const ok = setExportFormat(
                currentSession.id,
                detectedFormat as "png" | "svg",
            )
            if (!ok) {
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

            // Wait for browser to produce the export data
            const timeoutMs = 10000
            const start = Date.now()
            let exportData: string | undefined
            while (Date.now() - start < timeoutMs) {
                exportData = getExportData(currentSession.id)
                if (exportData) break
                await new Promise((r) => setTimeout(r, 200))
            }

            clearExportData(currentSession.id)

            if (!exportData) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: Export timed out. Make sure the browser tab is open and the diagram is loaded.",
                        },
                    ],
                    isError: true,
                }
            }

            // Decode and write
            if (detectedFormat === "png") {
                // exportData is a data:image/png;base64,... URI
                const base64 = exportData.replace(
                    /^data:image\/png;base64,/,
                    "",
                )
                await fs.writeFile(absolutePath, Buffer.from(base64, "base64"))
            } else {
                // SVG: may be a data URI or raw SVG
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
