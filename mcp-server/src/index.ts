#!/usr/bin/env node
/**
 * MCP Server Entry Point
 * Connects the draw.io MCP server to stdio transport
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "./server.js"

async function main() {
    const server = createServer()
    const transport = new StdioServerTransport()

    // Connect server to transport
    await server.connect(transport)

    console.error("[draw-io-mcp] Server started and connected to stdio transport")

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
        console.error("[draw-io-mcp] Received SIGINT, shutting down...")
        await server.close()
        process.exit(0)
    })

    process.on("SIGTERM", async () => {
        console.error("[draw-io-mcp] Received SIGTERM, shutting down...")
        await server.close()
        process.exit(0)
    })
}

main().catch((error) => {
    console.error("[draw-io-mcp] Fatal error:", error)
    process.exit(1)
})
