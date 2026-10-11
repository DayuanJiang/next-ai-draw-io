#!/usr/bin/env node
/**
 * Downloads the draw.io web app into public/drawio.
 *
 * The app embeds this copy from its own origin. Same origin lets the page
 * call the draw.io editor directly (highlight AI changes, read the selection,
 * undo AI edits, custom toolbar), which a cross-origin iframe does not allow.
 *
 * Runs before `dev` and `build`. It does nothing when the pinned version is
 * already present, or when NEXT_PUBLIC_DRAWIO_BASE_URL points to an external
 * draw.io (that setup does not need the bundled copy).
 *
 * The release asset (draw.war) is a zip file; it is unpacked with node:zlib
 * so no extra dependency is needed.
 */
import fs from "node:fs"
import path from "node:path"
import nextEnv from "@next/env"
import { readDrawioVersion, readZipEntries, sha256 } from "./drawio-zip.mjs"

// npm runs this before Next reads the .env files, so read them here: an
// external draw.io set in .env.local must skip the download too
nextEnv.loadEnvConfig(
    process.cwd(),
    process.env.npm_lifecycle_event === "predev",
)

// The pinned release and the SHA-256 of its draw.war, as GitHub lists it
// (packages/mcp-server/src/drawio-version.json, shared with the MCP server)
const {
    version: DRAWIO_VERSION,
    sha256: DRAWIO_SHA256,
    downloadUrl: DOWNLOAD_URL,
} = readDrawioVersion()
const DEST = path.join(process.cwd(), "public", "drawio")
const STAMP = path.join(DEST, ".version")

function log(message) {
    console.log(`[fetch-drawio] ${message}`)
}

function readStamp() {
    try {
        return fs.readFileSync(STAMP, "utf8").trim()
    } catch {
        return null
    }
}

async function main() {
    if (process.env.NEXT_PUBLIC_DRAWIO_BASE_URL) {
        log("NEXT_PUBLIC_DRAWIO_BASE_URL is set, skipping the bundled copy")
        return
    }
    if (readStamp() === DRAWIO_VERSION) return

    log(`Downloading draw.io ${DRAWIO_VERSION} ...`)
    let buf
    try {
        const res = await fetch(DOWNLOAD_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${DOWNLOAD_URL}`)
        buf = Buffer.from(await res.arrayBuffer())
        // The copy runs on the app's own origin: it must be the real release
        const actual = sha256(buf)
        if (actual !== DRAWIO_SHA256) {
            throw new Error(`draw.war checksum mismatch (got ${actual})`)
        }
    } catch (error) {
        if (fs.existsSync(path.join(DEST, "index.html"))) {
            log(`Download failed (${error.message}); keeping the existing copy`)
            return
        }
        console.error(
            `[fetch-drawio] Download failed: ${error.message}\n` +
                "The canvas needs draw.io. Check the network, or set " +
                "NEXT_PUBLIC_DRAWIO_BASE_URL to an external draw.io.",
        )
        process.exit(1)
    }

    // Unpack next to the target, then swap it in
    const tmp = `${DEST}.tmp-${process.pid}`
    fs.rmSync(tmp, { recursive: true, force: true })
    let files = 0
    for (const { name, data } of readZipEntries(buf)) {
        if (name.startsWith("WEB-INF/") || name.startsWith("META-INF/")) {
            continue
        }
        const target = path.join(tmp, name)
        if (!target.startsWith(tmp + path.sep)) {
            throw new Error(`Unsafe path in archive: ${name}`)
        }
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, data)
        files++
    }
    fs.writeFileSync(path.join(tmp, ".version"), `${DRAWIO_VERSION}\n`)

    fs.rmSync(DEST, { recursive: true, force: true })
    fs.renameSync(tmp, DEST)
    log(`Installed ${files} files into public/drawio`)
}

main().catch((error) => {
    console.error(`[fetch-drawio] ${error.stack || error}`)
    process.exit(1)
})
