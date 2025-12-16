/**
 * MCP Server Configuration
 * Sets up the McpServer with tools, resources, and prompts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerTools } from "./tools/index.js"
import { registerResources } from "./resources/index.js"
import { registerPrompts } from "./prompts/index.js"

/**
 * Create and configure the MCP server
 */
export function createServer(): McpServer {
    const server = new McpServer({
        name: "draw-io-mcp",
        version: "0.1.0",
    })

    // Register all tools
    registerTools(server)

    // Register all resources
    registerResources(server)

    // Register all prompts
    registerPrompts(server)

    console.error("[draw-io-mcp] Server configured with tools, resources, and prompts")

    return server
}
