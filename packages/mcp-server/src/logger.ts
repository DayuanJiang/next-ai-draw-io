/**
 * Logger for MCP server
 *
 * CRITICAL: MCP servers communicate via STDIO (stdin/stdout).
 * Using console.log() will corrupt the JSON-RPC protocol messages.
 * ALL logging MUST use console.error() which writes to stderr.
 */

export const log = {
    info: (msg: string, ...args: unknown[]) => {
        console.error(`[MCP-DrawIO] [INFO] ${msg}`, ...args)
    },
    error: (msg: string, ...args: unknown[]) => {
        console.error(`[MCP-DrawIO] [ERROR] ${msg}`, ...args)
    },
    debug: (msg: string, ...args: unknown[]) => {
        if (process.env.DEBUG === "true") {
            console.error(`[MCP-DrawIO] [DEBUG] ${msg}`, ...args)
        }
    },
    warn: (msg: string, ...args: unknown[]) => {
        console.error(`[MCP-DrawIO] [WARN] ${msg}`, ...args)
    },
}
