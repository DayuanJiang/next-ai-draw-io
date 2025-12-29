#!/usr/bin/env node

/**
 * Development script for running Electron with Next.js
 * 1. Starts Next.js dev server
 * 2. Waits for it to be ready
 * 3. Compiles Electron TypeScript
 * 4. Launches Electron
 */

import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

const NEXT_PORT = 6002
const NEXT_URL = `http://localhost:${NEXT_PORT}`

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
 * Start Next.js dev server
 */
function startNextServer() {
    const nextProcess = spawn("npm", ["run", "dev"], {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
        env: process.env,
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

    // Start Next.js dev server
    console.log("1. Starting Next.js development server...")
    const nextProcess = startNextServer()

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

    electronProcess.on("close", (code) => {
        console.log(`\nElectron exited with code ${code}`)
        nextProcess.kill()
        process.exit(code || 0)
    })

    electronProcess.on("error", (err) => {
        console.error("Electron error:", err)
        nextProcess.kill()
        process.exit(1)
    })

    // Handle termination signals
    const cleanup = () => {
        console.log("\n🛑 Shutting down...")
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
