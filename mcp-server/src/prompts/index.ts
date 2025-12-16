/**
 * Prompts index - registers all MCP prompts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerDiagramPrompts } from "./diagram-prompts.js"

/**
 * Register all diagram prompts
 */
export function registerPrompts(server: McpServer): void {
    registerDiagramPrompts(server)

    console.error("[draw-io-mcp] Registered prompts")
}
