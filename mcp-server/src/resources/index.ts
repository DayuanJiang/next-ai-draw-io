/**
 * Resources index - registers all MCP resources
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerTemplateResources } from "./templates.js"
import { registerStyleResource } from "./style-reference.js"

/**
 * Register all diagram resources
 */
export function registerResources(server: McpServer): void {
    registerTemplateResources(server)
    registerStyleResource(server)

    console.error("[draw-io-mcp] Registered resources")
}
