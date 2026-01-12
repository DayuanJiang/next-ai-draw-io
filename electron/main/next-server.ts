import { existsSync } from "node:fs"
import path from "node:path"
import { app, type UtilityProcess, utilityProcess } from "electron"
import {
    findAvailablePort,
    getAllocatedPort,
    getServerUrl,
    isPortAvailable,
} from "./port-manager"

let serverProcess: UtilityProcess | null = null

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

    // Verify server script exists before attempting to start
    if (!existsSync(serverPath)) {
        throw new Error(
            `Server script not found at ${serverPath}. ` +
                "Please ensure the app was built correctly with 'npm run build'.",
        )
    }

    // Find an available port (random in production, fixed in development)
    const port = await findAvailablePort()
    console.log(`Using port: ${port}`)

    // Set up environment variables
    const env: Record<string, string> = {
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "localhost",
        // Enable Node.js built-in proxy support for fetch (Node.js 24+)
        NODE_USE_ENV_PROXY: "1",
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

    // Debug: log proxy-related env vars
    console.log("Proxy env vars being passed to server:", {
        HTTP_PROXY: env.HTTP_PROXY || env.http_proxy || "not set",
        HTTPS_PROXY: env.HTTPS_PROXY || env.https_proxy || "not set",
        NODE_USE_ENV_PROXY: env.NODE_USE_ENV_PROXY || "not set",
    })

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

    const url = getServerUrl()
    await waitForServer(url)
    console.log(`Next.js server started at ${url}`)

    return url
}

/**
 * Stop the Next.js server process and wait for it to exit
 */
export async function stopNextServer(): Promise<void> {
    if (serverProcess) {
        console.log("Stopping Next.js server...")

        // Create a promise that resolves when the process exits
        const exitPromise = new Promise<void>((resolve) => {
            const proc = serverProcess
            if (!proc) {
                resolve()
                return
            }

            const onExit = () => {
                resolve()
            }

            proc.once("exit", onExit)

            // Timeout after 5 seconds
            setTimeout(() => {
                proc.removeListener("exit", onExit)
                resolve()
            }, 5000)
        })

        serverProcess.kill()
        serverProcess = null

        // Wait for process to exit
        await exitPromise

        // Additional wait for OS to release port
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
}

/**
 * Wait for the server to fully stop
 */
async function waitForServerStop(timeout = 5000): Promise<void> {
    const port = getAllocatedPort()
    if (port === null) {
        return
    }

    const start = Date.now()
    while (Date.now() - start < timeout) {
        const available = await isPortAvailable(port)
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

    // Stop the current server and wait for it to exit
    await stopNextServer()

    // Wait for the port to be released
    await waitForServerStop()

    // Start the server again
    return startNextServer()
}
