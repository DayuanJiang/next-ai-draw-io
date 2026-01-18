#!/usr/bin/env node

/**
 * Prepare standalone directory for Electron packaging
 * Copies the Next.js standalone output to a temp directory
 * that electron-builder can properly include
 */

import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const rootDir = join(__dirname, "..")

/**
 * Copy directory recursively, converting symlinks to regular files/directories.
 * This is needed because cpSync with dereference:true does NOT convert symlinks.
 * macOS codesign fails if bundle contains symlinks pointing outside the bundle.
 */
function copyDereferenced(src, dst) {
    const lstat = lstatSync(src)

    if (lstat.isSymbolicLink()) {
        // Follow symlink and check what it points to
        const stat = statSync(src)
        if (stat.isDirectory()) {
            // Symlink to directory: recursively copy the directory contents
            mkdirSync(dst, { recursive: true })
            for (const entry of readdirSync(src)) {
                copyDereferenced(join(src, entry), join(dst, entry))
            }
        } else {
            // Symlink to file: copy the actual file content
            mkdirSync(join(dst, ".."), { recursive: true })
            copyFileSync(src, dst)
        }
    } else if (lstat.isDirectory()) {
        mkdirSync(dst, { recursive: true })
        for (const entry of readdirSync(src)) {
            copyDereferenced(join(src, entry), join(dst, entry))
        }
    } else {
        mkdirSync(join(dst, ".."), { recursive: true })
        copyFileSync(src, dst)
    }
}

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

// Copy static files
console.log("Copying static files...")
const targetStaticDir = join(targetDir, ".next", "static")
copyDereferenced(staticDir, targetStaticDir)

// Copy public folder (required for favicon-white.svg and other assets)
console.log("Copying public folder...")
const publicDir = join(rootDir, "public")
const targetPublicDir = join(targetDir, "public")
if (existsSync(publicDir)) {
    copyDereferenced(publicDir, targetPublicDir)
}

console.log("Done! Files prepared in electron-standalone/")
