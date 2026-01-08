#!/usr/bin/env node

/**
 * Development script for running Electron with Next.js
 * 1. Reads preset configuration (if exists)
 * 2. Starts Next.js dev server with preset env vars
 * 3. Waits for it to be ready
 * 4. Compiles Electron TypeScript
 * 5. Launches Electron
 * 6. Watches for preset changes and restarts Next.js
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync, watch } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

const NEXT_PORT = 6002
const NEXT_URL = `http://localhost:${NEXT_PORT}`

/**
 * Get the user data path (same as Electron's app.getPath("userData"))
 */
function getUserDataPath() {
    const appName = "next-ai-draw-io"
    switch (process.platform) {
        case "darwin":
            return path.join(
                os.homedir(),
                "Library",
                "Application Support",
                appName,
            )
        case "win32":
            return path.join(
                process.env.APPDATA ||
                    path.join(os.homedir(), "AppData", "Roaming"),
                appName,
            )
        default:
            return path.join(os.homedir(), ".config", appName)
    }
}

/**
 * Load preset configuration from config file
 */
function loadPresetConfig() {
    const configPath = path.join(getUserDataPath(), "config-presets.json")

    if (!existsSync(configPath)) {
        console.log("📋 No preset configuration found, using .env.local")
        return null
    }

    try {
        const content = readFileSync(configPath, "utf-8")
        const data = JSON.parse(content)

        if (!data.currentPresetId) {
            console.log("📋 No active preset, using .env.local")
            return null
        }

        const preset = data.presets.find((p) => p.id === data.currentPresetId)
        if (!preset) {
            console.log("📋 Active preset not found, using .env.local")
            return null
        }

        console.log(`📋 Using preset: "${preset.name}"`)
        return preset.config
    } catch (error) {
        console.error("Failed to load preset config:", error.message)
        return null
    }
}

/**
 * Wait for the Next.js server to be ready
 */
async function waitForServer(url, timeout = 120000) {
    const start = Date.now()
    console.log(`Waiting for server at ${url}...`)

    while (Date.now() - start < timeout) {
        try {
            const response = await fetch(url)
            if (response.ok || response.status < 500) {
                console.log("Server is ready!")
                return true
            }
        } catch {
            // Server not ready yet
        }
        await new Promise((r) => setTimeout(r, 500))
        process.stdout.write(".")
    }

    throw new Error(`Timeout waiting for server at ${url}`)
}

/**
 * Run a command and wait for it to complete
 */
function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            cwd: rootDir,
            stdio: "inherit",
            shell: true,
            ...options,
        })

        proc.on("close", (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Command failed with code ${code}`))
            }
        })

        proc.on("error", reject)
    })
}

/**
 * Start Next.js dev server with preset environment
 */
function startNextServer(presetEnv) {
    const env = { ...process.env }

    // Apply preset environment variables
    if (presetEnv) {
        for (const [key, value] of Object.entries(presetEnv)) {
            if (value !== undefined && value !== "") {
                env[key] = value
            }
        }
    }

    const nextProcess = spawn("npm", ["run", "dev"], {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
        env,
    })

    nextProcess.on("error", (err) => {
        console.error("Failed to start Next.js:", err)
    })

    return nextProcess
}

/**
 * Main entry point
 */
async function main() {
    console.log("🚀 Starting Electron development environment...\n")

    // Load preset configuration
    const presetEnv = loadPresetConfig()

    // Start Next.js dev server with preset env
    console.log("1. Starting Next.js development server...")
    let nextProcess = startNextServer(presetEnv)

    // Wait for Next.js to be ready
    try {
        await waitForServer(NEXT_URL)
        console.log("")
    } catch (err) {
        console.error("\n❌ Next.js server failed to start:", err.message)
        nextProcess.kill()
        process.exit(1)
    }

    // Compile Electron TypeScript
    console.log("\n2. Compiling Electron code...")
    try {
        await runCommand("npm", ["run", "electron:compile"])
    } catch (err) {
        console.error("❌ Electron compilation failed:", err.message)
        nextProcess.kill()
        process.exit(1)
    }

    // Start Electron
    console.log("\n3. Starting Electron...")
    const electronProcess = spawn("npm", ["run", "electron:start"], {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
        env: {
            ...process.env,
            NODE_ENV: "development",
            ELECTRON_DEV_URL: NEXT_URL,
        },
    })

    // Watch for preset config changes
    const configPath = path.join(getUserDataPath(), "config-presets.json")
    let configWatcher = null
    let restartPending = false

    function setupConfigWatcher() {
        if (!existsSync(path.dirname(configPath))) {
            // Directory doesn't exist yet, check again later
            setTimeout(setupConfigWatcher, 5000)
            return
        }

        try {
            configWatcher = watch(
                configPath,
                { persistent: false },
                async (eventType) => {
                    if (eventType === "change" && !restartPending) {
                        restartPending = true
                        console.log(
                            "\n🔄 Preset configuration changed, restarting Next.js server...",
                        )

                        // Kill current Next.js process
                        nextProcess.kill()

                        // Wait a bit for process to die
                        await new Promise((r) => setTimeout(r, 1000))

                        // Reload preset and restart
                        const newPresetEnv = loadPresetConfig()
                        nextProcess = startNextServer(newPresetEnv)

                        try {
                            await waitForServer(NEXT_URL)
                            console.log(
                                "✅ Next.js server restarted with new configuration\n",
                            )
                        } catch (err) {
                            console.error(
                                "❌ Failed to restart Next.js:",
                                err.message,
                            )
                        }

                        restartPending = false
                    }
                },
            )
            console.log("👀 Watching for preset configuration changes...")
        } catch (_err) {
            // File might not exist yet, that's ok
            setTimeout(setupConfigWatcher, 5000)
        }
    }

    // Start watching after a delay (config file might not exist yet)
    setTimeout(setupConfigWatcher, 2000)

    electronProcess.on("close", (code) => {
        console.log(`\nElectron exited with code ${code}`)
        if (configWatcher) configWatcher.close()
        nextProcess.kill()
        process.exit(code || 0)
    })

    electronProcess.on("error", (err) => {
        console.error("Electron error:", err)
        if (configWatcher) configWatcher.close()
        nextProcess.kill()
        process.exit(1)
    })

    // Handle termination signals
    const cleanup = () => {
        console.log("\n🛑 Shutting down...")
        if (configWatcher) configWatcher.close()
        electronProcess.kill()
        nextProcess.kill()
        process.exit(0)
    }

    process.on("SIGINT", cleanup)
    process.on("SIGTERM", cleanup)
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})
