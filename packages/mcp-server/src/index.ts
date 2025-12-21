#!/usr/bin/env node
/**
 * MCP Server for Next AI Draw.io
 *
 * Enables AI agents (Claude Desktop, Cursor, etc.) to generate and edit
 * draw.io diagrams with real-time browser preview.
 */

// Setup DOM polyfill for Node.js (required for XML operations)
import { DOMParser } from "linkedom"
;(globalThis as any).DOMParser = DOMParser

class XMLSerializerPolyfill {
    serializeToString(node: any): string {
        if (node.outerHTML !== undefined) return node.outerHTML
        if (node.documentElement) return node.documentElement.outerHTML
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
import { getState, setState, startHttpServer } from "./http-server.js"
import { log } from "./logger.js"
import { validateAndFixXml } from "./xml-validation.js"

const config = { port: parseInt(process.env.PORT || "6002") }

let currentSession: { id: string; xml: string } | null = null

const server = new McpServer({ name: "next-ai-drawio", version: "0.1.2" })

// Workflow guidance prompt
server.prompt(
    "diagram-workflow",
    "Guidelines for creating and editing draw.io diagrams",
    () => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `# Draw.io Diagram Workflow

## Creating a New Diagram
1. Call start_session to open browser preview
2. Use display_diagram with mxGraphModel XML

## Adding Elements
Use edit_diagram with "add" operation - provide cell_id and new_xml

## Modifying/Deleting Elements
1. Call get_diagram to see current cell IDs
2. Use edit_diagram with "update" or "delete" operations

## Notes
- display_diagram REPLACES entire diagram
- edit_diagram PRESERVES user's manual changes`,
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
            "Start a new diagram session and open browser for real-time preview.",
        inputSchema: {},
    },
    async () => {
        try {
            const port = await startHttpServer(config.port)
            const sessionId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
            currentSession = { id: sessionId, xml: "" }

            const browserUrl = `http://localhost:${port}?mcp=${sessionId}`
            await open(browserUrl)

            log.info(`Started session ${sessionId}, browser at ${browserUrl}`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Session started!\n\nSession ID: ${sessionId}\nBrowser: ${browserUrl}`,
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
            "Use edit_diagram to add elements to existing diagram.",
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
                            text: "Error: No active session. Call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            let xml = inputXml
            const { valid, error, fixed, fixes } = validateAndFixXml(xml)
            if (fixed) {
                xml = fixed
                log.info(`XML auto-fixed: ${fixes.join(", ")}`)
            }
            if (!valid && error) {
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

            // Save current state before replacing
            if (currentSession.xml) {
                addHistory(currentSession.id, currentSession.xml)
            }

            currentSession.xml = xml
            setState(currentSession.id, xml)

            // Save new state
            addHistory(currentSession.id, xml)

            log.info(`Displayed diagram, ${xml.length} chars`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Diagram displayed! (${xml.length} chars)`,
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
            "Edit diagram by operations (update/add/delete cells). " +
            "Fetches latest browser state first, preserving user's changes.\n\n" +
            "Operations:\n" +
            "- add: Add new cell (cell_id + new_xml)\n" +
            "- update: Replace cell (cell_id + new_xml)\n" +
            "- delete: Remove cell (cell_id only)",
        inputSchema: {
            operations: z
                .array(
                    z.object({
                        type: z.enum(["update", "add", "delete"]),
                        cell_id: z.string(),
                        new_xml: z.string().optional(),
                    }),
                )
                .describe("Operations to apply"),
        },
    },
    async ({ operations }) => {
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            // Fetch latest from browser
            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }

            if (!currentSession.xml) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No diagram to edit. Use display_diagram first.",
                        },
                    ],
                    isError: true,
                }
            }

            // Save before editing
            addHistory(currentSession.id, currentSession.xml)

            // Validate operations
            const validatedOps = operations.map((op) => {
                if (op.new_xml) {
                    const { fixed, fixes } = validateAndFixXml(op.new_xml)
                    if (fixed) {
                        log.info(
                            `${op.type} ${op.cell_id}: auto-fixed: ${fixes.join(", ")}`,
                        )
                        return { ...op, new_xml: fixed }
                    }
                }
                return op
            })

            const { result, errors } = applyDiagramOperations(
                currentSession.xml,
                validatedOps as DiagramOperation[],
            )

            currentSession.xml = result
            setState(currentSession.id, result)

            // Save after editing
            addHistory(currentSession.id, result)

            log.info(`Edited diagram: ${operations.length} operation(s)`)

            const msg = `Applied ${operations.length} operation(s).`
            const warn =
                errors.length > 0
                    ? `\nWarnings: ${errors.map((e) => `${e.type} ${e.cellId}: ${e.message}`).join(", ")}`
                    : ""

            return { content: [{ type: "text", text: msg + warn }] }
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
            "Get current diagram XML (fetches latest from browser). " +
            "Call before edit_diagram to see cell IDs.",
    },
    async () => {
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }

            if (!currentSession.xml) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No diagram yet. Use display_diagram to create one.",
                        },
                    ],
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: `Current diagram:\n\n${currentSession.xml}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
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
        description: "Export diagram to .drawio file.",
        inputSchema: {
            path: z.string().describe("File path (e.g., ./diagram.drawio)"),
        },
    },
    async ({ path }) => {
        try {
            if (!currentSession) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No active session. Call start_session first.",
                        },
                    ],
                    isError: true,
                }
            }

            const browserState = getState(currentSession.id)
            if (browserState?.xml) {
                currentSession.xml = browserState.xml
            }

            if (!currentSession.xml) {
                return {
                    content: [
                        { type: "text", text: "Error: No diagram to export." },
                    ],
                    isError: true,
                }
            }

            const fs = await import("node:fs/promises")
            const nodePath = await import("node:path")

            let filePath = path
            if (!filePath.endsWith(".drawio")) filePath += ".drawio"

            const absolutePath = nodePath.resolve(filePath)
            await fs.writeFile(absolutePath, currentSession.xml, "utf-8")

            log.info(`Exported to ${absolutePath}`)

            return {
                content: [
                    {
                        type: "text",
                        text: `Exported to ${absolutePath}`,
                    },
                ],
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            }
        }
    },
)

// Start server
async function main() {
    log.info("Starting MCP server...")
    const transport = new StdioServerTransport()
    await server.connect(transport)
    log.info("MCP server running")
}

main().catch((error) => {
    log.error("Fatal:", error)
    process.exit(1)
})
