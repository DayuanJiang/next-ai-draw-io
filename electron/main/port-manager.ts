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
    // Production mode uses fixed port (61337) to preserve localStorage
    // Falls back to sequential ports if unavailable
    production: 61337,
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
        server.once("error", () => resolve(false))
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
 * - In production: uses fixed port (61337) to preserve localStorage
 * - Falls back to sequential ports if preferred port is unavailable
 *
 * @param reuseExisting If true, try to reuse the previously allocated port
 * @returns Promise<number> The available port
 * @throws Error if no available port found after max attempts
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

    // Try preferred port first
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

    throw new Error(
        `Failed to find available port after ${PORT_CONFIG.maxAttempts} attempts`,
    )
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
    return `http://localhost:${allocatedPort}`
}
