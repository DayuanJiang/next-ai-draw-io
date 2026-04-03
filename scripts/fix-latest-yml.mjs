/**
 * Fix latest.yml metadata after Windows code signing.
 *
 * electron-builder generates latest.yml with hashes of unsigned executables.
 * After SignPath signs them, the hashes change. This script reads each
 * latest*.yml in release/, finds the matching signed exe in release-signed/,
 * and rewrites the sha512 and size fields.
 *
 * Usage: node scripts/fix-latest-yml.mjs
 */

import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const RELEASE_DIR = "release"
const SIGNED_DIR = "release-signed"

// Find all latest*.yml files
const ymlFiles = readdirSync(RELEASE_DIR).filter(
    (f) => f.startsWith("latest") && f.endsWith(".yml"),
)

if (ymlFiles.length === 0) {
    console.log("No latest*.yml files found in release/")
    process.exit(0)
}

// Build a map of signed exe filenames to their hash and size
const signedFiles = new Map()
for (const f of readdirSync(SIGNED_DIR)) {
    if (!f.endsWith(".exe")) continue
    const filePath = join(SIGNED_DIR, f)
    const buffer = readFileSync(filePath)
    const sha512 = createHash("sha512").update(buffer).digest("base64")
    const size = statSync(filePath).size
    signedFiles.set(f, { sha512, size })
}

if (signedFiles.size === 0) {
    console.error("No signed .exe files found in release-signed/")
    process.exit(1)
}

console.log(
    `Found ${signedFiles.size} signed exe(s):`,
    [...signedFiles.keys()].join(", "),
)

for (const ymlFile of ymlFiles) {
    const ymlPath = join(RELEASE_DIR, ymlFile)
    const content = readFileSync(ymlPath, "utf-8")
    const lines = content.split("\n")
    const outputLines = []

    // Track the current file entry being processed (by url field)
    let currentExeName = null

    for (const line of lines) {
        // Match "  url: SomeFile.exe" inside the files array
        const urlMatch = line.match(/^\s+url:\s+(.+\.exe)\s*$/)
        if (urlMatch) {
            currentExeName = urlMatch[1]
            outputLines.push(line)
            continue
        }

        // Match top-level "path: SomeFile.exe"
        const pathMatch = line.match(/^path:\s+(.+\.exe)\s*$/)
        if (pathMatch) {
            currentExeName = pathMatch[1]
            outputLines.push(line)
            continue
        }

        // Replace sha512 lines
        const sha512Match = line.match(/^(\s*)sha512:\s+/)
        if (sha512Match && currentExeName && signedFiles.has(currentExeName)) {
            const indent = sha512Match[1]
            outputLines.push(
                `${indent}sha512: ${signedFiles.get(currentExeName).sha512}`,
            )
            continue
        }

        // Replace size lines
        const sizeMatch = line.match(/^(\s*)size:\s+\d+/)
        if (sizeMatch && currentExeName && signedFiles.has(currentExeName)) {
            const indent = sizeMatch[1]
            outputLines.push(
                `${indent}size: ${signedFiles.get(currentExeName).size}`,
            )
            // Reset current exe after processing both sha512 and size
            currentExeName = null
            continue
        }

        outputLines.push(line)
    }

    writeFileSync(ymlPath, outputLines.join("\n"))
    console.log(`Updated ${ymlFile}`)
}

console.log("Done!")
