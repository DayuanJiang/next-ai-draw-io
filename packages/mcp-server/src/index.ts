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
import {
    addHistoryEntry,
    getHistory,
    getHistoryCount,
    getVersion as getHistoryVersion,
} from "./history.js"
import {
    getServerPort,
    getState,
    setState,
    startHttpServer,
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

            // 1. Save current state to history BEFORE replacing (preserve user's work)
            if (currentSession.xml) {
                // Check last entry's source to use correct label
                const lastEntry = getHistory(currentSession.id, 1)[0]
                const actualSource = lastEntry?.source || "human"
                addHistoryEntry(currentSession.id, {
                    xml: currentSession.xml,
                    svg: "",
                    source: actualSource,
                    tool: "display_diagram",
                    timestamp: new Date(),
                    description: "Before AI replaced",
                })
            }

            // Update session state
            currentSession.xml = xml
            currentSession.version++

            // Push to embedded server state
            setState(currentSession.id, xml)

            // 2. Save new state to history AFTER generation (capture AI result)
            addHistoryEntry(currentSession.id, {
                xml: xml,
                svg: "",
                source: "ai",
                tool: "display_diagram",
                timestamp: new Date(),
                description: "AI generated diagram",
            })

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
            "Edit the current diagram by ID-based operations (update/add/delete cells). " +
            "ALWAYS fetches the latest state from browser first, so user's manual changes are preserved.\n\n" +
            "IMPORTANT workflow:\n" +
            "- For ADD operations: Can use directly - just provide new unique cell_id and new_xml.\n" +
            "- For UPDATE/DELETE: Call get_diagram FIRST to see current cell IDs, then edit.\n\n" +
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

            // 1. Save current state to history BEFORE editing (preserve user's work)
            // Check last entry's source to use correct label
            const lastEntry = getHistory(currentSession.id, 1)[0]
            const actualSource = lastEntry?.source || "human"
            addHistoryEntry(currentSession.id, {
                xml: currentSession.xml,
                svg: "",
                source: actualSource,
                tool: "edit_diagram",
                timestamp: new Date(),
                description: "Before AI edit",
            })

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

            // 2. Save new state to history AFTER editing (capture AI result)
            addHistoryEntry(currentSession.id, {
                xml: result,
                svg: "",
                source: "ai",
                tool: "edit_diagram",
                timestamp: new Date(),
                description: `AI edit: ${operations.length} operation(s)`,
            })

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

// Tool: list_history
server.registerTool(
    "list_history",
    {
        description:
            "List diagram version history for the current session. " +
            "Shows version numbers, who made each change (AI vs human), and timestamps. " +
            "Use this to find a version to restore.",
        inputSchema: {
            limit: z
                .number()
                .optional()
                .describe("Maximum number of entries to return (default: 20)"),
        },
    },
    async ({ limit = 20 }) => {
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

            const history = getHistory(currentSession.id, limit)

            if (history.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No history available yet. Make some changes to create history.",
                        },
                    ],
                }
            }

            const historyText = history
                .map((entry) => {
                    const time = entry.timestamp.toLocaleTimeString()
                    const source = entry.source === "ai" ? "AI" : "Human"
                    const desc = entry.description
                        ? ` - ${entry.description}`
                        : ""
                    return `v${entry.version} [${source}] ${time}${desc}`
                })
                .join("\n")

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram History (${history.length} entries, newest first):\n\n${historyText}\n\nUse restore_version to restore a specific version.`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("list_history failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: restore_version
server.registerTool(
    "restore_version",
    {
        description:
            "Restore diagram to a previous version from history. " +
            "Use list_history first to see available versions. " +
            "This creates a NEW history entry (non-destructive).",
        inputSchema: {
            version: z.number().describe("Version number to restore"),
        },
    },
    async ({ version }) => {
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

            const entry = getHistoryVersion(currentSession.id, version)
            if (!entry) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Version ${version} not found in history. Use list_history to see available versions.`,
                        },
                    ],
                    isError: true,
                }
            }

            // Restore by updating session and state
            currentSession.xml = entry.xml
            currentSession.version++
            setState(currentSession.id, entry.xml)

            // Add history entry for the restore
            addHistoryEntry(currentSession.id, {
                xml: entry.xml,
                svg: entry.svg,
                source: "ai",
                tool: "restore_version",
                timestamp: new Date(),
                description: `Restored from v${version}`,
            })

            log.info(`Restored diagram to v${version}`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram restored to version ${version} successfully!\n\nThe browser will update automatically.`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("restore_version failed:", message)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Tool: get_version
server.registerTool(
    "get_version",
    {
        description:
            "Get the XML content of a specific version from history. " +
            "Use this to inspect what a previous version looked like before restoring.",
        inputSchema: {
            version: z.number().describe("Version number to retrieve"),
        },
    },
    async ({ version }) => {
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

            const entry = getHistoryVersion(currentSession.id, version)
            if (!entry) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Version ${version} not found in history.`,
                        },
                    ],
                    isError: true,
                }
            }

            const source = entry.source === "ai" ? "AI" : "Human"
            const time = entry.timestamp.toISOString()

            return {
                content: [
                    {
                        type: "text",
                        text: `Version ${version} (${source} edit at ${time}):\n\n${entry.xml}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error("get_version failed:", message)
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
