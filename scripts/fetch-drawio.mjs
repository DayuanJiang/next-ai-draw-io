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
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import nextEnv from "@next/env"

// npm runs this before Next reads the .env files, so read them here: an
// external draw.io set in .env.local must skip the download too
nextEnv.loadEnvConfig(
    process.cwd(),
    process.env.npm_lifecycle_event === "predev",
)

// Pinned because the UI relies on draw.io internals; bump both deliberately
const DRAWIO_VERSION = "v32.0.2"
// SHA-256 of that release's draw.war, as GitHub lists it
const DRAWIO_SHA256 =
    "3cb8abec8e9bfc7504760c9cdc9194ecf7e8de178aa2a1d668801c32ecf1a1a7"
const DEST = path.join(process.cwd(), "public", "drawio")
const STAMP = path.join(DEST, ".version")
const DOWNLOAD_URL = `https://github.com/jgraph/drawio/releases/download/${DRAWIO_VERSION}/draw.war`

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

// Minimal zip reader: finds the central directory and inflates each entry
function* readZipEntries(buf) {
    const EOCD_SIG = 0x06054b50
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) {
            eocd = i
            break
        }
    }
    if (eocd < 0) throw new Error("Not a zip file (end record not found)")

    const count = buf.readUInt16LE(eocd + 10)
    let offset = buf.readUInt32LE(eocd + 16)

    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error("Corrupt zip central directory")
        }
        const method = buf.readUInt16LE(offset + 10)
        const compressedSize = buf.readUInt32LE(offset + 20)
        const nameLength = buf.readUInt16LE(offset + 28)
        const extraLength = buf.readUInt16LE(offset + 30)
        const commentLength = buf.readUInt16LE(offset + 32)
        const localOffset = buf.readUInt32LE(offset + 42)
        const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength)
        offset += 46 + nameLength + extraLength + commentLength

        const localNameLength = buf.readUInt16LE(localOffset + 26)
        const localExtraLength = buf.readUInt16LE(localOffset + 28)
        const start = localOffset + 30 + localNameLength + localExtraLength
        const raw = buf.subarray(start, start + compressedSize)

        if (name.endsWith("/")) continue
        if (method !== 0 && method !== 8) {
            throw new Error(`Unsupported zip compression ${method} (${name})`)
        }
        yield { name, data: method === 8 ? zlib.inflateRawSync(raw) : raw }
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
        const actual = crypto.createHash("sha256").update(buf).digest("hex")
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
