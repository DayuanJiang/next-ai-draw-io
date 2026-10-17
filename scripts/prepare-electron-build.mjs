#!/usr/bin/env node

/**
 * Prepare standalone directory for Electron packaging
 * Copies the Next.js standalone output to a temp directory
 * that electron-builder can properly include
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import copyDereferenced from "./copy-dereferenced.cjs"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const rootDir = join(__dirname, "..")

const standaloneDir = join(rootDir, ".next", "standalone")
const staticDir = join(rootDir, ".next", "static")
const targetDir = join(rootDir, "electron-standalone")

console.log("Preparing Electron build...")

// Clean target directory
if (existsSync(targetDir)) {
    console.log("Cleaning previous build...")
    rmSync(targetDir, { recursive: true })
}

// Create target directory
mkdirSync(targetDir, { recursive: true })

// Copy standalone (includes node_modules)
console.log("Copying standalone directory...")
copyDereferenced(standaloneDir, targetDir)

// Next.js copies the build machine's .env files into standalone; don't ship
// them, they can hold the builder's API keys
for (const entry of readdirSync(targetDir)) {
    if (entry.startsWith(".env")) {
        console.warn(`Removing ${entry} so it is not packaged into the app`)
        rmSync(join(targetDir, entry))
    }
}

// Copy static files
console.log("Copying static files...")
const targetStaticDir = join(targetDir, ".next", "static")
copyDereferenced(staticDir, targetStaticDir)

// Copy public folder (required for favicons and other assets)
console.log("Copying public folder...")
const publicDir = join(rootDir, "public")
const targetPublicDir = join(targetDir, "public")
if (existsSync(publicDir)) {
    copyDereferenced(publicDir, targetPublicDir)
}

console.log("Done! Files prepared in electron-standalone/")
