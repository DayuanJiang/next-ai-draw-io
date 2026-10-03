import { readFileSync, writeFileSync } from "node:fs"
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
 * File that remembers the production port from the last launch, so the app
 * keeps the same origin (and its localStorage) instead of switching between
 * the legacy and new port depending on which one is free at startup
 */
function getSavedPortPath(): string {
    return path.join(app.getPath("userData"), "server-port.json")
}

function loadSavedPort(): number | null {
    try {
        const { port } = JSON.parse(readFileSync(getSavedPortPath(), "utf-8"))
        return Number.isInteger(port) ? port : null
    } catch {
        return null
    }
}

/**
 * Remember the port the production server started on
 */
export function saveServerPort(port: number): void {
    if (!app.isPackaged || port === loadSavedPort()) {
        return
    }
    try {
        writeFileSync(getSavedPortPath(), JSON.stringify({ port }), "utf-8")
    } catch (error) {
        console.error("Failed to save server port:", error)
    }
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
 * - In production: uses the port from the last launch, then the legacy
 *   port (61337), then 13370, to preserve localStorage
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

    // In production, use the port from the last launch first
    if (!isDev) {
        const savedPort = loadSavedPort()
        if (savedPort !== null) {
            if (await isPortAvailable(savedPort)) {
                allocatedPort = savedPort
                return savedPort
            }
            console.warn(
                `Port ${savedPort} from the last launch is unavailable. Data saved under it will not show on the new port.`,
            )
        }
    }

    // In production, try legacy port first to preserve existing users' localStorage
    if (!isDev) {
        const legacyPort = PORT_CONFIG.legacyProduction
        if (await isPortAvailable(legacyPort)) {
            allocatedPort = legacyPort
            return legacyPort
        }
    }

    // Try preferred port
    if (await isPortAvailable(preferredPort)) {
        allocatedPort = preferredPort
        return preferredPort
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
