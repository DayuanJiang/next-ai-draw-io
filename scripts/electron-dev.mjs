#!/usr/bin/env node

/**
 * Development script for running Electron with Next.js
 * 1. Reads the active preset's env vars (if any)
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
 * File where the Electron main process (in development) writes the active
 * preset's env vars, already decrypted and mapped to provider-specific keys
 * (see writeDevPresetEnv in electron/main/config-manager.ts)
 */
const PRESET_ENV_FILE = "dev-preset-env.json"

/**
 * Read the active preset's env vars as JSON text (null if not available)
 */
function readPresetEnvFile() {
    try {
        const content = readFileSync(
            path.join(getUserDataPath(), PRESET_ENV_FILE),
            "utf-8",
        )
        JSON.parse(content) // Ignore a half-written file
        return content
    } catch {
        return null
    }
}

/**
 * Load the active preset's env vars
 */
function loadPresetEnv(content) {
    const env = content ? JSON.parse(content) : {}
    if (Object.keys(env).length === 0) {
        console.log("📋 No active preset, using .env.local")
        return null
    }
    console.log(`📋 Using preset env: ${Object.keys(env).join(", ")}`)
    return env
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
 * Kill a process started with shell: true. On Windows, kill() only ends the
 * cmd.exe wrapper and leaves next dev running, so kill the whole tree.
 */
function killProcess(proc) {
    if (process.platform === "win32" && proc.pid) {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"])
    } else {
        proc.kill()
    }
}

/**
 * Start Next.js dev server with preset environment
 */
function startNextServer(presetEnv) {
    // The preset keys are the user's own, not a server's
    const env = { ...process.env, NEXT_AI_DRAWIO_DESKTOP: "1" }

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
    let presetEnvContent = readPresetEnvFile()
    const presetEnv = loadPresetEnv(presetEnvContent)

    // Start Next.js dev server with preset env
    console.log("1. Starting Next.js development server...")
    let nextProcess = startNextServer(presetEnv)

    // Wait for Next.js to be ready
    try {
        await waitForServer(NEXT_URL)
        console.log("")
    } catch (err) {
        console.error("\n❌ Next.js server failed to start:", err.message)
        killProcess(nextProcess)
        process.exit(1)
    }

    // Compile Electron TypeScript
    console.log("\n2. Compiling Electron code...")
    try {
        await runCommand("npm", ["run", "electron:compile"])
    } catch (err) {
        console.error("❌ Electron compilation failed:", err.message)
        killProcess(nextProcess)
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

    // Watch for preset env changes
    const userDataPath = getUserDataPath()
    let configWatcher = null
    let restartPending = false

    // Restart Next.js when the preset env vars really changed
    async function applyPresetChange() {
        if (restartPending) return
        const newContent = readPresetEnvFile()
        if (newContent === null || newContent === presetEnvContent) return

        restartPending = true
        presetEnvContent = newContent
        console.log(
            "\n🔄 Preset configuration changed, restarting Next.js server...",
        )

        // Kill current Next.js process
        killProcess(nextProcess)

        // Wait a bit for process to die
        await new Promise((r) => setTimeout(r, 1000))

        // Reload preset and restart
        nextProcess = startNextServer(loadPresetEnv(newContent))

        try {
            await waitForServer(NEXT_URL)
            console.log("✅ Next.js server restarted with new configuration\n")
        } catch (err) {
            console.error("❌ Failed to restart Next.js:", err.message)
        }

        restartPending = false
        // A change written during the restart was skipped above
        applyPresetChange()
    }

    function setupConfigWatcher() {
        if (!existsSync(userDataPath)) {
            // Directory doesn't exist yet, check again later
            setTimeout(setupConfigWatcher, 5000)
            return
        }

        try {
            // Watch the directory, since the file may not exist yet
            configWatcher = watch(
                userDataPath,
                { persistent: false },
                (_eventType, filename) => {
                    if (filename === PRESET_ENV_FILE) applyPresetChange()
                },
            )
            console.log("👀 Watching for preset configuration changes...")
            // Electron may have written its preset before the watch started
            applyPresetChange()
        } catch (_err) {
            // Directory might not be ready yet, try again later
            setTimeout(setupConfigWatcher, 5000)
        }
    }

    // Start watching after a delay (user data directory might not exist yet)
    setTimeout(setupConfigWatcher, 2000)

    electronProcess.on("close", (code) => {
        console.log(`\nElectron exited with code ${code}`)
        if (configWatcher) configWatcher.close()
        killProcess(nextProcess)
        process.exit(code || 0)
    })

    electronProcess.on("error", (err) => {
        console.error("Electron error:", err)
        if (configWatcher) configWatcher.close()
        killProcess(nextProcess)
        process.exit(1)
    })

    // Handle termination signals
    const cleanup = () => {
        console.log("\n🛑 Shutting down...")
        if (configWatcher) configWatcher.close()
        killProcess(electronProcess)
        killProcess(nextProcess)
        process.exit(0)
    }

    process.on("SIGINT", cleanup)
    process.on("SIGTERM", cleanup)
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})
