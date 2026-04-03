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
import {
    createReadStream,
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs"
import { join } from "node:path"

const RELEASE_DIR = "release"
const SIGNED_DIR = "release-signed"

// Verify directories exist
if (!existsSync(RELEASE_DIR)) {
    console.error(`Error: ${RELEASE_DIR}/ directory does not exist`)
    process.exit(1)
}
if (!existsSync(SIGNED_DIR)) {
    console.error(`Error: ${SIGNED_DIR}/ directory does not exist`)
    process.exit(1)
}

// Find all latest*.yml files
const ymlFiles = readdirSync(RELEASE_DIR).filter(
    (f) => f.startsWith("latest") && f.endsWith(".yml"),
)

if (ymlFiles.length === 0) {
    console.log("No latest*.yml files found in release/")
    process.exit(0)
}

/**
 * Compute SHA-512 hash of a file using streaming (avoids loading large exe into memory)
 */
function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha512")
        const stream = createReadStream(filePath)
        stream.on("data", (chunk) => hash.update(chunk))
        stream.on("end", () => resolve(hash.digest("base64")))
        stream.on("error", reject)
    })
}

// Build a map of signed exe filenames to their hash and size
const signedFiles = new Map()
for (const f of readdirSync(SIGNED_DIR)) {
    if (!f.endsWith(".exe")) continue
    const filePath = join(SIGNED_DIR, f)
    const sha512 = await hashFile(filePath)
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
