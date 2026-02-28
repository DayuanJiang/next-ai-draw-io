import net from "node:net"
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
 * - In production: uses fixed port (13370) to preserve localStorage
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
