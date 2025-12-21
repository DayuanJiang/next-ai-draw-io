#!/usr/bin/env node

/**
 * Prepare standalone directory for Electron packaging
 * Copies the Next.js standalone output to a temp directory
 * that electron-builder can properly include
 */

import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

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
cpSync(standaloneDir, targetDir, { recursive: true })

// Copy static files
console.log("Copying static files...")
const targetStaticDir = join(targetDir, ".next", "static")
mkdirSync(targetStaticDir, { recursive: true })
cpSync(staticDir, targetStaticDir, { recursive: true })

console.log("Done! Files prepared in electron-standalone/")
