import { existsSync, readFileSync, writeFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { app } from "electron"

/**
 * Port configuration
 * Using fixed ports to preserve localStorage across restarts
 * (localStorage is origin-specific, so changing ports loses all saved data)
 */
const PORT_CONFIG = {
    // Development mode uses fixed port for hot reload compatibility
    development: 6002,
    // Legacy production port — tried first to preserve localStorage for existing users
    legacyProduction: 61337,
    // New production port below the ephemeral range (49152-65535)
    // to avoid conflicts with Windows Hyper-V / ephemeral port reservations
    production: 13370,
    // Maximum attempts to find an available port (fallback)
    maxAttempts: 100,
}

/**
 * Currently allocated port (cached after first allocation)
 */
let allocatedPort: number | null = null

/**
 * Whether chats are saved under http://127.0.0.1:<port>: Electron keeps
 * each origin's IndexedDB in its own folder
 */
function hasStoredData(port: number): boolean {
    return existsSync(
        path.join(
            app.getPath("userData"),
            "IndexedDB",
            `http_127.0.0.1_${port}.indexeddb.leveldb`,
        ),
    )
}

// The two fixed production ports, the only ones whose origin (and so its
// chats and settings) is the same at every launch
const HOME_PORTS = [PORT_CONFIG.legacyProduction, PORT_CONFIG.production]

const chatPortFile = () => path.join(app.getPath("userData"), "chat-port.json")

/** The fixed port where a chat was last saved, if known */
function readChatPort(): number | null {
    try {
        const { port } = JSON.parse(readFileSync(chatPortFile(), "utf-8"))
        return HOME_PORTS.includes(port) ? port : null
    } catch {
        return null
    }
}

function writeChatPort(port: number): void {
    try {
        writeFileSync(chatPortFile(), JSON.stringify({ port }))
    } catch (error) {
        console.warn("Could not save the chat port:", error)
    }
}

/**
 * The page saved a chat: open on this port next time. Chats of the two
 * ports cannot be shown together (each origin has its own storage), so the
 * app opens where the user last worked. A launch that had to use the other
 * port and saved nothing does not move it.
 */
export function rememberChatPort(): void {
    const port = allocatedPort
    if (!app.isPackaged || port === null || !HOME_PORTS.includes(port)) return
    if (readChatPort() !== port) writeChatPort(port)
}

/**
 * The page loaded without any chats. Before any chat was saved under this
 * version (no file yet), the user's chats may be on the other fixed port,
 * where an older version opened: try it first next time.
 */
export function noteNoChats(): void {
    const port = allocatedPort
    if (!app.isPackaged || port === null || !HOME_PORTS.includes(port)) return
    if (existsSync(chatPortFile())) return
    const other = HOME_PORTS.find((p) => p !== port)
    if (other !== undefined && hasStoredData(other)) writeChatPort(other)
}

/**
 * Check if a specific port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
        server.once("error", (err: NodeJS.ErrnoException) => {
            console.warn(`Port ${port} unavailable: ${err.code}`)
            resolve(false)
        })
        server.once("listening", () => {
            server.close()
            resolve(true)
        })
        server.listen(port, "127.0.0.1")
    })
}

/**
 * Find an available port
 * - In development: uses fixed port (6002)
 * - In production: uses the legacy port (61337), then 13370, to preserve
 *   localStorage; 13370 first when only it has saved chats
 * - Falls back to sequential ports if preferred port is unavailable
 * - Last resort: lets the OS assign a port (port 0)
 *
 * @param reuseExisting If true, try to reuse the previously allocated port
 * @returns Promise<number> The available port
 */
export async function findAvailablePort(reuseExisting = true): Promise<number> {
    const isDev = !app.isPackaged
    const preferredPort = isDev
        ? PORT_CONFIG.development
        : PORT_CONFIG.production

    // Try to reuse cached port if requested and available
    if (reuseExisting && allocatedPort !== null) {
        const available = await isPortAvailable(allocatedPort)
        if (available) {
            return allocatedPort
        }
        console.warn(
            `Previously allocated port ${allocatedPort} is no longer available`,
        )
        allocatedPort = null
    }

    // In production, first the port where a chat was last saved. Without
    // one, the legacy port first to preserve existing users' data, unless
    // only the new port has data: their app started on 13370 while Windows
    // reserved 61337, and 61337 being free now would hide it
    const chatPort = isDev ? null : readChatPort()
    const candidates = isDev
        ? [preferredPort]
        : chatPort !== null
          ? [chatPort, ...HOME_PORTS.filter((p) => p !== chatPort)]
          : hasStoredData(PORT_CONFIG.production) &&
              !hasStoredData(PORT_CONFIG.legacyProduction)
            ? [PORT_CONFIG.production, PORT_CONFIG.legacyProduction]
            : [PORT_CONFIG.legacyProduction, PORT_CONFIG.production]
    for (const port of candidates) {
        if (await isPortAvailable(port)) {
            allocatedPort = port
            return port
        }
    }

    console.warn(
        `Preferred port ${preferredPort} is in use, finding alternative...`,
    )

    // Fallback: try sequential ports starting from preferred + 1
    for (let attempt = 1; attempt <= PORT_CONFIG.maxAttempts; attempt++) {
        const port = preferredPort + attempt
        if (await isPortAvailable(port)) {
            allocatedPort = port
            console.log(`Allocated fallback port: ${port}`)
            return port
        }
    }

    // Last resort: let the OS pick an available port
    console.warn(
        "All sequential ports failed. Requesting OS-assigned port (localStorage may not persist across restarts).",
    )
    const osPort = await new Promise<number>((resolve, reject) => {
        const server = net.createServer()
        server.once("error", reject)
        server.once("listening", () => {
            const addr = server.address()
            const port = (addr as net.AddressInfo).port
            server.close(() => resolve(port))
        })
        server.listen(0, "127.0.0.1")
    })
    allocatedPort = osPort
    console.log(`OS assigned port: ${osPort}`)
    return osPort
}

/**
 * Get the currently allocated port
 * Returns null if no port has been allocated yet
 */
export function getAllocatedPort(): number | null {
    return allocatedPort
}

/**
 * Reset the allocated port (useful for testing or restart scenarios)
 */
export function resetAllocatedPort(): void {
    allocatedPort = null
}

/**
 * Get the server URL with the allocated port
 */
export function getServerUrl(): string {
    if (allocatedPort === null) {
        throw new Error(
            "No port allocated yet. Call findAvailablePort() first.",
        )
    }
    return `http://127.0.0.1:${allocatedPort}`
}
