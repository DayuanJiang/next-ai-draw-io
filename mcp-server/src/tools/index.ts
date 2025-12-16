/**
 * Tools index - registers all MCP tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerGenerateDiagramTool } from "./generate-diagram.js"
import { registerEditDiagramTool } from "./edit-diagram.js"
import { registerApplyOperationsTool } from "./apply-operations.js"
import { registerValidateXmlTool } from "./validate-xml.js"
import { registerExportDiagramTool } from "./export-diagram.js"

/**
 * Register all diagram manipulation tools
 */
export function registerTools(server: McpServer): void {
    registerGenerateDiagramTool(server)
    registerEditDiagramTool(server)
    registerApplyOperationsTool(server)
    registerValidateXmlTool(server)
    registerExportDiagramTool(server)

    console.error("[draw-io-mcp] Registered 5 tools")
}
