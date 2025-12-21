import net from "node:net"
import path from "node:path"
import { app, type UtilityProcess, utilityProcess } from "electron"

let serverProcess: UtilityProcess | null = null
const PORT = 6001

/**
 * Get the path to the standalone server resources
 * In packaged app: resources/standalone
 * In development: .next/standalone
 */
function getResourcePath(): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, "standalone")
    }
    return path.join(app.getAppPath(), ".next", "standalone")
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
        server.once("error", () => resolve(false))
        server.once("listening", () => {
            server.close()
            resolve(true)
        })
        server.listen(port)
    })
}

/**
 * Wait for the server to be ready by polling the health endpoint
 */
async function waitForServer(url: string, timeout = 30000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        try {
            const response = await fetch(url)
            if (response.ok || response.status < 500) {
                return
            }
        } catch {
            // Server not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Server startup timeout after ${timeout}ms`)
}

/**
 * Start the Next.js standalone server using Electron's utilityProcess
 * This API is designed for running Node.js code in the background
 */
export async function startNextServer(): Promise<string> {
    const resourcePath = getResourcePath()
    const serverPath = path.join(resourcePath, "server.js")

    console.log(`Starting Next.js server from: ${resourcePath}`)
    console.log(`Server script path: ${serverPath}`)

    // Check if port is already in use
    const available = await isPortAvailable(PORT)
    if (!available) {
        console.log(
            `Port ${PORT} is already in use, assuming server is running`,
        )
        return `http://localhost:${PORT}`
    }

    // Set up environment variables
    const env: Record<string, string> = {
        NODE_ENV: "production",
        PORT: String(PORT),
        HOSTNAME: "localhost",
    }

    // Set cache directory to a writable location (user's app data folder)
    // This is necessary because the packaged app might be on a read-only volume
    if (app.isPackaged) {
        const cacheDir = path.join(app.getPath("userData"), "cache")
        env.NEXT_CACHE_DIR = cacheDir
    }

    // Copy existing environment variables
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && !env[key]) {
            env[key] = value
        }
    }

    // Use Electron's utilityProcess API for running Node.js in background
    // This is the recommended way to run Node.js code in Electron
    serverProcess = utilityProcess.fork(serverPath, [], {
        cwd: resourcePath,
        env,
        stdio: "pipe",
    })

    serverProcess.stdout?.on("data", (data) => {
        console.log(`[Next.js] ${data.toString().trim()}`)
    })

    serverProcess.stderr?.on("data", (data) => {
        console.error(`[Next.js Error] ${data.toString().trim()}`)
    })

    serverProcess.on("exit", (code) => {
        console.log(`Next.js server exited with code ${code}`)
        serverProcess = null
    })

    const url = `http://localhost:${PORT}`
    await waitForServer(url)
    console.log(`Next.js server started at ${url}`)

    return url
}

/**
 * Stop the Next.js server process
 */
export function stopNextServer(): void {
    if (serverProcess) {
        console.log("Stopping Next.js server...")
        serverProcess.kill()
        serverProcess = null
    }
}

/**
 * Wait for the server to fully stop
 */
async function waitForServerStop(timeout = 5000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const available = await isPortAvailable(PORT)
        if (available) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    console.warn("Server stop timeout, port may still be in use")
}

/**
 * Restart the Next.js server with new environment variables
 */
export async function restartNextServer(): Promise<string> {
    console.log("Restarting Next.js server...")

    // Stop the current server
    stopNextServer()

    // Wait for the port to be released
    await waitForServerStop()

    // Start the server again
    return startNextServer()
}
