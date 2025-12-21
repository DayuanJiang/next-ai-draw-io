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
    getState,
    requestSync,
    setState,
    startHttpServer,
    waitForSync,
} from "./http-server.js"
import { log } from "./logger.js"
import { validateAndFixXml } from "./xml-validation.js"

// Server configuration
const config = {
    port: parseInt(process.env.PORT || "6002"),
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
2. Use display_diagram with complete mxGraphModel XML to create a new diagram

## Adding Elements to Existing Diagram
1. Use edit_diagram with "add" operation
2. Provide a unique cell_id and complete mxCell XML
3. No need to call get_diagram first - the server fetches latest state automatically

## Modifying or Deleting Existing Elements
1. FIRST call get_diagram to see current cell IDs and structure
2. THEN call edit_diagram with "update" or "delete" operations
3. For update, provide the cell_id and complete new mxCell XML

## Important Notes
- display_diagram REPLACES the entire diagram - only use for new diagrams
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

// Tool: display_diagram
server.registerTool(
    "display_diagram",
    {
        description:
            "Display a NEW draw.io diagram from XML. REPLACES the entire diagram. " +
            "Use this for creating new diagrams from scratch. " +
            "To ADD elements to an existing diagram, use edit_diagram with 'add' operation instead. " +
            "You should generate valid draw.io/mxGraph XML format.",
        inputSchema: {
            xml: z
                .string()
                .describe("The draw.io XML to display (mxGraphModel format)"),
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

            log.info(`Displaying diagram, ${xml.length} chars`)

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

            // Push to embedded server state
            setState(currentSession.id, xml)

            // Save AI result (no SVG yet - will be captured by browser)
            addHistory(currentSession.id, xml, "")

            log.info(`Diagram displayed successfully`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram displayed successfully!\n\nThe diagram is now visible in your browser.\n\nXML length: ${xml.length} characters`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("display_diagram failed:", message)
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
            "For add/update, new_xml must be a complete mxCell element including mxGeometry.",
        inputSchema: {
            operations: z
                .array(
                    z.object({
                        type: z
                            .enum(["update", "add", "delete"])
                            .describe("Operation type"),
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
                            text: "Error: No diagram to edit. Please create a diagram first with display_diagram.",
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
                            `Operation ${op.type} ${op.cell_id}: XML auto-fixed: ${fixes.join(", ")}`,
                        )
                        return { ...op, new_xml: fixed }
                    }
                    if (!valid && error) {
                        log.warn(
                            `Operation ${op.type} ${op.cell_id}: XML validation failed: ${error}`,
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
                            text: "No diagram exists yet. Use display_diagram to create one.",
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
        description: "Export the current diagram to a .drawio file.",
        inputSchema: {
            path: z
                .string()
                .describe(
                    "File path to save the diagram (e.g., ./diagram.drawio)",
                ),
        },
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

            let filePath = path
            if (!filePath.endsWith(".drawio")) {
                filePath = `${filePath}.drawio`
            }

            const absolutePath = nodePath.resolve(filePath)
            await fs.writeFile(absolutePath, currentSession.xml, "utf-8")

            log.info(`Diagram exported to ${absolutePath}`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram exported successfully!\n\nFile: ${absolutePath}\nSize: ${currentSession.xml.length} characters`,
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
