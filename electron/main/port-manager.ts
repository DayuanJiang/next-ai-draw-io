import net from "node:net"
import { app } from "electron"

/**
 * Port configuration
 */
const PORT_CONFIG = {
    // Development mode uses fixed port for hot reload compatibility
    development: 6002,
    // Production mode port range (will find first available)
    production: {
        min: 10000,
        max: 65535,
    },
    // Maximum attempts to find an available port
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
 * Generate a random port within the production range
 */
function getRandomPort(): number {
    const { min, max } = PORT_CONFIG.production
    return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Find an available port
 * - In development: uses fixed port (6002)
 * - In production: finds a random available port
 * - If a port was previously allocated, verifies it's still available
 *
 * @param reuseExisting If true, try to reuse the previously allocated port
 * @returns Promise<number> The available port
 * @throws Error if no available port found after max attempts
 */
export async function findAvailablePort(reuseExisting = true): Promise<number> {
    const isDev = !app.isPackaged

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

    if (isDev) {
        // Development mode: use fixed port
        const port = PORT_CONFIG.development
        const available = await isPortAvailable(port)
        if (available) {
            allocatedPort = port
            return port
        }
        console.warn(
            `Development port ${port} is in use, finding alternative...`,
        )
    }

    // Production mode or dev port unavailable: find random available port
    for (let attempt = 0; attempt < PORT_CONFIG.maxAttempts; attempt++) {
        const port = isDev
            ? PORT_CONFIG.development + attempt + 1
            : getRandomPort()

        const available = await isPortAvailable(port)
        if (available) {
            allocatedPort = port
            console.log(`Allocated port: ${port}`)
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
